/* =======================================================
   TRUORA IDENTITY — APP LOGIC
   Maneja:
   1. Carga del iframe con el token del usuario
   2. Escucha de postMessages del iframe (eventos del proceso)
   3. Panel de eventos en tiempo real
   4. Gestión de webhooks simulada (para demo)
   ======================================================= */

'use strict';

// ── Selectores ──────────────────────────────────────────
const tokenInput      = document.getElementById('token-input');
const btnClearToken   = document.getElementById('btn-clear-token');
const btnLaunch       = document.getElementById('btn-launch');
const btnBack         = document.getElementById('btn-back');
const btnClearEvents  = document.getElementById('btn-clear-events');
const sectionConfig   = document.getElementById('section-config');
const sectionIframe   = document.getElementById('section-iframe');
const truoraIframe    = document.getElementById('truora-iframe');
const iframeOverlay   = document.getElementById('iframe-overlay');
const iframeSubtitle  = document.getElementById('iframe-subtitle');
const eventList       = document.getElementById('event-list');
const eventEmpty      = document.getElementById('event-empty');

// ── Base URL del flujo de Truora ────────────────────────
const TRUORA_BASE_URL = 'https://identity.truora.com/';

// ── Estado de la aplicación ─────────────────────────────
let events = [];

/* =========================================================
   1. LANZAR IFRAME
   ========================================================= */
function launchIframe() {
  const token = tokenInput.value.trim();

  if (!token) {
    shakeInput();
    showToast('⚠️ Ingresa el Web Integration Token antes de continuar.', 'warning');
    return;
  }

  // Construye la URL de proceso según la documentación de Truora:
  // https://identity.truora.com/?token=<api_key>
  const processUrl = `${TRUORA_BASE_URL}?token=${encodeURIComponent(token)}`;

  // Establece el src del iframe
  truoraIframe.src = processUrl;
  iframeSubtitle.textContent = `Token: ${token.substring(0, 12)}...`;

  // Muestra la sección del iframe
  sectionConfig.hidden  = false; // mantiene config visible en desktop
  sectionIframe.hidden  = false;
  iframeOverlay.classList.remove('hidden');

  // Scroll suave hacia el iframe
  setTimeout(() => sectionIframe.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

  logEvent('info', 'iframe.loaded', {
    url: processUrl,
    tokenPreview: `${token.substring(0, 12)}...`,
    timestamp: new Date().toISOString(),
  });
}

/* =========================================================
   2. EVENTOS DEL IFRAME (postMessage)
   Truora envía 3 tipos de mensajes:
   - truora.process.succeeded
   - truora.process.failed
   - truora.steps.completed
   ========================================================= */
window.addEventListener('message', (event) => {
  // Seguridad: solo acepta mensajes del origen de Truora
  // En producción también valida event.origin === 'https://identity.truora.com'
  const data = event.data;

  if (!data) return;

  // Normaliza: puede llegar como string o como objeto
  const message = typeof data === 'string' ? data : (data.type || data.message || JSON.stringify(data));

  if (message.includes('truora.process.succeeded')) {
    logEvent('success', 'truora.process.succeeded', data);
    showToast('✅ Verificación completada con éxito.', 'success');

  } else if (message.includes('truora.process.failed')) {
    logEvent('error', 'truora.process.failed', data);
    showToast('❌ El proceso de verificación falló.', 'error');

  } else if (message.includes('truora.steps.completed')) {
    logEvent('warning', 'truora.steps.completed', data);
    showToast('⏳ Pasos completados. Esperando validación asíncrona…', 'warning');

  } else {
    // Cualquier otro mensaje de Truora (ej. navegación interna, resize requests)
    // Solo lo registramos si viene del origen esperado para evitar ruido
    if (event.origin && event.origin.includes('truora.com')) {
      logEvent('info', 'truora.message', data);
    }
  }
});

/* =========================================================
   3. CARGA DEL IFRAME
   ========================================================= */
truoraIframe.addEventListener('load', () => {
  // Oculta el overlay de carga cuando el iframe termina de cargar
  setTimeout(() => {
    iframeOverlay.classList.add('hidden');
  }, 600);
});

/* =========================================================
   4. REGISTRO Y VISUALIZACIÓN DE EVENTOS
   ========================================================= */

/**
 * Registra un evento en el panel lateral.
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {string} label
 * @param {any} rawData
 */
function logEvent(type, label, rawData) {
  const entry = { type, label, rawData, timestamp: new Date() };
  events.unshift(entry);

  // Elimina el mensaje de "vacío" si existe
  if (eventEmpty) eventEmpty.style.display = 'none';

  // Crea el elemento de lista
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
      <div class="event-type event-type--${type}">${label}</div>
      <pre class="event-data">${escapeHtml(dataStr)}</pre>
    </div>
    <time class="event-time">${timeStr}</time>
  `;

  eventList.insertBefore(li, eventList.firstChild);

  // Scroll suave a la sección de eventos
  document.getElementById('section-events')
    .scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* =========================================================
   5. WEBHOOKS — ENDPOINT SIMULADO
   En producción esta lógica vive en tu backend.
   Aquí mostramos cómo luce un payload de webhook de Truora.

   Para el reto, el panel de Truora Dashboard permite configurar
   la URL de webhook. Cuando el proceso termina, Truora hace un
   POST a tu URL con el resultado.

   Estructura típica del payload:
   {
     "event": "process_completed",
     "account_id": "user-abc-123",
     "process_id": "proc_xxxxx",
     "status": "success" | "failure" | "pending",
     "flow_id": "flow_xxxxx",
     "timestamp": "2026-05-08T18:00:00Z"
   }
   ========================================================= */

/**
 * Simula la recepción de un webhook para demostración.
 * En producción, el backend llama a esta función al recibir el POST de Truora.
 */
function simulateWebhook(payload) {
  const defaults = {
    event: 'process_completed',
    account_id: 'demo-user-001',
    process_id: `proc_${Math.random().toString(36).slice(2, 10)}`,
    status: 'success',
    flow_id: 'flow_demo',
    timestamp: new Date().toISOString(),
  };
  const data = Object.assign({}, defaults, payload);
  logEvent('info', `webhook · ${data.event}`, data);
}

/* =========================================================
   6. UI — INTERACCIONES
   ========================================================= */

// Botón "Iniciar Verificación"
btnLaunch.addEventListener('click', launchIframe);

// Iniciar con Enter en el input
tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') launchIframe();
});

// Limpiar token
btnClearToken.addEventListener('click', () => {
  tokenInput.value = '';
  tokenInput.focus();
});

// Volver a configuración
btnBack.addEventListener('click', () => {
  sectionIframe.hidden = true;
  truoraIframe.src = '';
  tokenInput.focus();
});

// Limpiar eventos
btnClearEvents.addEventListener('click', () => {
  events = [];
  const items = eventList.querySelectorAll('.event-item');
  items.forEach(el => el.remove());
  if (eventEmpty) eventEmpty.style.display = '';
});

// Navegación pills (demo visual)
document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('pill--active'));
    pill.classList.add('pill--active');
    if (pill.id === 'nav-events') {
      document.getElementById('section-events').scrollIntoView({ behavior: 'smooth' });
    }
  });
});

/* =========================================================
   7. TOAST NOTIFICATIONS
   ========================================================= */
function showToast(message, type = 'info') {
  // Elimina toasts anteriores
  const existing = document.getElementById('truora-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'truora-toast';
  toast.setAttribute('role', 'alert');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    padding: 14px 20px;
    border-radius: 12px;
    font-size: 14px;
    font-family: Inter, sans-serif;
    font-weight: 500;
    max-width: 340px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    animation: toastIn 0.3s ease;
    backdrop-filter: blur(10px);
    border: 1px solid;
    line-height: 1.5;
  `;

  const styles = {
    success: { bg: 'rgba(22,101,52,0.95)',  border: '#22c55e', color: '#bbf7d0' },
    error:   { bg: 'rgba(127,29,29,0.95)',  border: '#ef4444', color: '#fecaca' },
    warning: { bg: 'rgba(120,53,15,0.95)',  border: '#f59e0b', color: '#fde68a' },
    info:    { bg: 'rgba(7,89,133,0.95)',   border: '#38bdf8', color: '#bae6fd' },
  };

  const s = styles[type] || styles.info;
  toast.style.background   = s.bg;
  toast.style.borderColor  = s.border;
  toast.style.color        = s.color;
  toast.textContent        = message;

  // Agrega keyframes si no existen
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes toastIn {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  // Auto-dismiss
  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/* =========================================================
   8. UTILIDADES
   ========================================================= */
function shakeInput() {
  const group = document.querySelector('.input-group');
  group.style.animation = 'none';
  group.offsetHeight; // reflow
  group.style.animation = 'shake 0.4s ease';

  if (!document.getElementById('shake-style')) {
    const style = document.createElement('style');
    style.id = 'shake-style';
    style.textContent = `
      @keyframes shake {
        0%,100% { transform: translateX(0); }
        20%      { transform: translateX(-6px); }
        40%      { transform: translateX(6px); }
        60%      { transform: translateX(-4px); }
        80%      { transform: translateX(4px); }
      }
    `;
    document.head.appendChild(style);
  }
}

/* =========================================================
   9. EVENTO DE INICIO — log de bienvenida
   ========================================================= */
window.addEventListener('DOMContentLoaded', () => {
  logEvent('info', 'app.ready', {
    version: '1.0.0',
    description: 'Truora iframe integration demo',
    docs: 'https://dev.truora.com/digital-identity/iframe_integration/',
  });

  // Expone simulateWebhook globalmente para pruebas desde la consola
  window.truoraSimulateWebhook = simulateWebhook;
  console.info(
    '%c🔵 Truora Demo\n%cPuedes simular un webhook ejecutando:\n  truoraSimulateWebhook({ status: "success" })',
    'font-size:14px;font-weight:bold;color:#6366f1',
    'font-size:12px;color:#94a3b8'
  );
});
