/* =======================================================
   TRUORA IDENTITY — APP LOGIC v2
   
   Flujo completo:
   1. Al cargar: comprueba que el servidor tenga config OK (/api/start-verification)
   2. Click "Iniciar":
      a. POST /api/start-verification  → {account_id, token, process_url}
      b. Muestra account_id y token en el panel
      c. Carga el iframe con process_url
   3. Escucha postMessage del iframe
   4. Panel de eventos en tiempo real (postMessage + webhooks recibidos)
   ======================================================= */

'use strict';

// ── Selectores ──────────────────────────────────────────
const btnStart          = document.getElementById('btn-start');
const btnLabel          = document.getElementById('btn-label');
const btnIcon           = document.getElementById('btn-icon');
const btnSpinner        = document.getElementById('btn-spinner');
const btnNewSession     = document.getElementById('btn-new-session');
const btnClearEvents    = document.getElementById('btn-clear-events');
const btnCopyWebhook    = document.getElementById('btn-copy-webhook');

const sectionConfig     = document.getElementById('section-config');
const sectionIframe     = document.getElementById('section-iframe');
const sectionEvents     = document.getElementById('section-events');
const sectionGuide      = document.getElementById('section-guide');

const apiKeyStatus      = document.getElementById('api-key-status');
const processInfo       = document.getElementById('process-info');
const infoAccountId     = document.getElementById('info-account-id');
const infoToken         = document.getElementById('info-token');
const infoUrl           = document.getElementById('info-url');

const truoraIframe      = document.getElementById('truora-iframe');
const iframeOverlay     = document.getElementById('iframe-overlay');
const iframeSubtitle    = document.getElementById('iframe-subtitle');

const eventList         = document.getElementById('event-list');
const eventEmpty        = document.getElementById('event-empty');

const webhookEndpointUrl = document.getElementById('webhook-endpoint-url');
const guideWebhookUrl    = document.getElementById('guide-webhook-url');

// ── Estado ──────────────────────────────────────────────
let events = [];
let currentAccountId = null;

/* =========================================================
   1. INICIALIZACIÓN: detectar la URL base del sitio
   ========================================================= */
function getSiteBaseUrl() {
  return `${window.location.protocol}//${window.location.host}`;
}

function initWebhookUrls() {
  const base = getSiteBaseUrl();
  const url = `${base}/api/webhook`;
  if (webhookEndpointUrl) webhookEndpointUrl.textContent = url;
  if (guideWebhookUrl)    guideWebhookUrl.textContent    = url;
}

/* =========================================================
   2. VERIFICAR CONFIGURACIÓN DEL SERVIDOR
   Hace un HEAD/OPTIONS implícito — en la práctica hacemos
   un pequeño GET que devuelve 405 (solo acepta POST) pero
   eso significa que el servidor está vivo y configurado.
   Una alternativa más limpia: endpoint /api/health
   ========================================================= */
async function checkServerConfig() {
  setStatusChip('loading', 'Verificando configuración del servidor…');

  try {
    // Hacemos un OPTIONS / GET al endpoint. Si el servidor devuelve 405
    // o 200, significa que está vivo y las env vars están cargadas.
    const res = await fetch('/api/start-verification', { method: 'GET' });

    if (res.status === 405 || res.status === 200) {
      // Servidor OK (405 = Method Not Allowed = el endpoint existe)
      setStatusChip('ok', 'Servidor configurado correctamente ✓');
      btnStart.disabled = false;
    } else if (res.status === 500) {
      const data = await res.json().catch(() => ({}));
      setStatusChip('error', `Error de configuración: ${data.error || 'env vars faltantes'}`);
    } else {
      setStatusChip('ok', 'Servidor activo ✓');
      btnStart.disabled = false;
    }
  } catch (_) {
    // En desarrollo local sin servidor (solo archivos estáticos), el endpoint no existe
    setStatusChip('error',
      'Servidor no disponible. Abre con "vercel dev" o despliega en Vercel para llamar la API.');
  }
}

function setStatusChip(state, label) {
  const dot = apiKeyStatus.querySelector('.status-dot');
  const lbl = apiKeyStatus.querySelector('.status-label');

  dot.className = 'status-dot';
  if (state === 'loading') dot.classList.add('status-dot--loading');
  if (state === 'ok')      dot.classList.add('status-dot--ok');
  if (state === 'error')   dot.classList.add('status-dot--error');

  lbl.textContent = label;
}

/* =========================================================
   3. INICIAR VERIFICACIÓN
   POST /api/start-verification
   Respuesta: { account_id, token, process_url }
   ========================================================= */
async function startVerification() {
  setLoadingState(true);

  logEvent('neutral', 'api.request', {
    endpoint: '/api/start-verification',
    method: 'POST',
    note: 'Creando account_id y generando web integration token…',
  });

  let data;
  try {
    const res = await fetch('/api/start-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  } catch (err) {
    setLoadingState(false);
    logEvent('error', 'api.error', {
      message: err.message,
      hint: 'Verifica que TRUORA_API_KEY y TRUORA_FLOW_ID estén configuradas en Vercel.',
    });
    showToast(`❌ Error: ${err.message}`, 'error');
    return;
  }

  setLoadingState(false);

  // Guardar account_id activo
  currentAccountId = data.account_id;

  // Mostrar panel de info
  infoAccountId.textContent = data.account_id;
  infoToken.textContent     = data.token;
  infoUrl.textContent       = data.process_url;
  processInfo.classList.remove('hidden');

  // Log del éxito
  logEvent('neutral', 'api.response', {
    account_id: data.account_id,
    token_preview: `${data.token.substring(0, 20)}…`,
    process_url: data.process_url,
  });

  showToast(`✅ account_id: ${data.account_id.substring(0, 16)}…`, 'success');

  // Cargar iframe
  loadIframe(data.process_url, data.account_id);
}

function setLoadingState(loading) {
  btnStart.disabled = loading;
  btnSpinner.classList.toggle('hidden', !loading);
  btnIcon.classList.toggle('hidden', loading);
  btnLabel.textContent = loading ? 'Generando sesión…' : 'Iniciar Verificación';
}

/* =========================================================
   4. CARGAR IFRAME
   ========================================================= */
function loadIframe(processUrl, accountId) {
  truoraIframe.src = '';
  iframeOverlay.classList.remove('hidden');
  iframeSubtitle.textContent = `account_id: ${accountId}`;

  sectionIframe.classList.remove('hidden');
  setTimeout(() => sectionIframe.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

  // Pequeño delay para que el overlay se vea antes de cargar
  setTimeout(() => {
    truoraIframe.src = processUrl;
  }, 200);
}

truoraIframe.addEventListener('load', () => {
  // Oculta overlay cuando el iframe termina de cargar
  // (solo si ya tiene src para no dispararse en el src vacío)
  if (truoraIframe.src && truoraIframe.src !== window.location.href) {
    setTimeout(() => iframeOverlay.classList.add('hidden'), 800);
  }
});

/* =========================================================
   5. EVENTS DEL IFRAME (postMessage)
   Truora envía uno de estos tres mensajes:
   - truora.process.succeeded
   - truora.process.failed
   - truora.steps.completed
   ========================================================= */
window.addEventListener('message', (event) => {
  // Seguridad: ignorar mensajes de orígenes desconocidos
  if (event.origin && !event.origin.includes('truora.com') && !event.origin.includes('identity.truora.com')) {
    // En desarrollo podría venir del mismo origen; lo dejamos pasar si no tiene origen hostil
    if (event.origin !== window.location.origin) return;
  }

  const raw = event.data;
  if (!raw) return;

  const message = typeof raw === 'string' ? raw : (raw.type || raw.message || JSON.stringify(raw));

  if (message.includes('truora.process.succeeded')) {
    logEvent('success', 'truora.process.succeeded', raw);
    showToast('✅ Verificación completada con éxito', 'success');

  } else if (message.includes('truora.process.failed')) {
    logEvent('error', 'truora.process.failed', raw);
    showToast('❌ El proceso de verificación falló', 'error');

  } else if (message.includes('truora.steps.completed')) {
    logEvent('warning', 'truora.steps.completed', raw);
    showToast('⏳ Pasos completados — esperando validación asíncrona', 'warning');

  } else if (typeof raw === 'object' && event.origin.includes('truora')) {
    logEvent('info', 'truora.message', raw);
  }
});

/* =========================================================
   6. REGISTRO Y VISUALIZACIÓN DE EVENTOS
   ========================================================= */
function logEvent(type, label, rawData) {
  const entry = { type, label, rawData, timestamp: new Date() };
  events.unshift(entry);

  if (eventEmpty) eventEmpty.style.display = 'none';

  const li = document.createElement('li');
  li.className = 'event-item';

  const dataStr = typeof rawData === 'object'
    ? JSON.stringify(rawData, null, 2)
    : String(rawData);

  const timeStr = entry.timestamp.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  li.innerHTML = `
    <div class="event-dot event-dot--${type}"></div>
    <div class="event-body">
      <div class="event-type event-type--${type}">${escapeHtml(label)}</div>
      <pre class="event-data">${escapeHtml(dataStr)}</pre>
    </div>
    <time class="event-time">${timeStr}</time>
  `;

  eventList.insertBefore(li, eventList.firstChild);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* =========================================================
   7. WEBHOOK SIMULATION (para demos sin Vercel desplegado)
   Expuesto globalmente: truoraSimulateWebhook({ status: 'success' })
   ========================================================= */
function simulateWebhook(payload = {}) {
  const defaults = {
    event: 'process_completed',
    account_id: currentAccountId || 'demo-account',
    process_id: `IDP${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    status: 'success',
    flow_id: 'demo-flow',
    timestamp: new Date().toISOString(),
  };
  const data = { ...defaults, ...payload };
  logEvent('info', `webhook · ${data.event}`, data);
  showToast(`🔔 Webhook simulado: ${data.status}`, 'info');
}

/* =========================================================
   8. NAVEGACIÓN CON PILLS
   ========================================================= */
const navMap = {
  'nav-verification': null,                // scroll al top / config
  'nav-events':       sectionEvents,
  'nav-guide':        sectionGuide,
};

document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('pill--active'));
    pill.classList.add('pill--active');

    const target = navMap[pill.id];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      sectionConfig.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* =========================================================
   9. BOTONES COPY
   ========================================================= */
document.querySelectorAll('[data-copy]').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-copy');
    const el = document.getElementById(targetId);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent.trim())
      .then(() => showToast('📋 Copiado al portapapeles', 'info'))
      .catch(() => showToast('No se pudo copiar', 'error'));
  });
});

if (btnCopyWebhook) {
  btnCopyWebhook.addEventListener('click', () => {
    const url = webhookEndpointUrl?.textContent?.trim() || '';
    navigator.clipboard.writeText(url)
      .then(() => showToast('📋 URL del webhook copiada', 'info'))
      .catch(() => showToast('No se pudo copiar', 'error'));
  });
}

/* =========================================================
   10. OTROS BOTONES
   ========================================================= */
btnStart.addEventListener('click', startVerification);

if (btnNewSession) {
  btnNewSession.addEventListener('click', () => {
    sectionIframe.classList.add('hidden');
    truoraIframe.src = '';
    processInfo.classList.add('hidden');
    infoAccountId.textContent = '—';
    infoToken.textContent = '—';
    infoUrl.textContent = '—';
    currentAccountId = null;
    sectionConfig.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (btnClearEvents) {
  btnClearEvents.addEventListener('click', () => {
    events = [];
    eventList.querySelectorAll('.event-item').forEach(el => el.remove());
    if (eventEmpty) eventEmpty.style.display = '';
  });
}

/* =========================================================
   11. TOAST NOTIFICATIONS
   ========================================================= */
function showToast(message, type = 'info') {
  const existing = document.getElementById('truora-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'truora-toast';
  toast.setAttribute('role', 'alert');

  const styles = {
    success: { bg: 'rgba(20,83,45,0.97)',   border: '#22c55e', color: '#bbf7d0' },
    error:   { bg: 'rgba(127,29,29,0.97)',  border: '#ef4444', color: '#fecaca' },
    warning: { bg: 'rgba(120,53,15,0.97)',  border: '#f59e0b', color: '#fde68a' },
    info:    { bg: 'rgba(7,89,133,0.97)',   border: '#38bdf8', color: '#bae6fd' },
  };
  const s = styles[type] || styles.info;

  Object.assign(toast.style, {
    position:       'fixed',
    bottom:         '24px',
    right:          '24px',
    zIndex:         '9999',
    padding:        '14px 20px',
    borderRadius:   '12px',
    fontSize:       '14px',
    fontFamily:     'Inter, sans-serif',
    fontWeight:     '500',
    maxWidth:       '360px',
    boxShadow:      '0 8px 32px rgba(0,0,0,0.4)',
    animation:      'toastIn 0.3s ease',
    backdropFilter: 'blur(10px)',
    border:         `1px solid ${s.border}`,
    background:     s.bg,
    color:          s.color,
    lineHeight:     '1.5',
  });

  toast.textContent = message;

  if (!document.getElementById('toast-kf')) {
    const style = document.createElement('style');
    style.id = 'toast-kf';
    style.textContent = `@keyframes toastIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4500);
}

/* =========================================================
   12. DOMContentLoaded — arranque
   ========================================================= */
window.addEventListener('DOMContentLoaded', () => {
  initWebhookUrls();
  checkServerConfig();

  // Exponer helpers globales para la consola
  window.truoraSimulateWebhook = simulateWebhook;
  window.truoraLogEvent = logEvent;

  logEvent('neutral', 'app.ready', {
    version: '2.0.0',
    docs: 'https://dev.truora.com/digital-identity/iframe_integration/',
    webhook_endpoint: `${getSiteBaseUrl()}/api/webhook`,
    tip: 'Ejecuta truoraSimulateWebhook({ status: "success" }) en la consola para simular un webhook',
  });

  console.info(
    '%c🟣 Truora Identity v2\n%cComandos disponibles:\n  truoraSimulateWebhook({ status: "success" })\n  truoraSimulateWebhook({ status: "failure", event: "process_completed" })',
    'font-size:14px;font-weight:bold;color:#6366f1',
    'font-size:12px;color:#94a3b8',
  );
});
