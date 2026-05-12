/**
 * POST /api/webhook
 *
 * Endpoint receptor de webhooks de Truora.
 * Truora envía un POST con un JWT firmado cuando ocurre un evento
 * (proceso completado, validación fallida, etc.).
 *
 * Almacena los últimos 20 eventos en memoria para que el frontend
 * los pueda consultar vía GET /api/webhook-events (polling).
 *
 * Variables de entorno recomendadas:
 *   WEBHOOK_SECRET  →  Secret para verificar la firma JWT de Truora (opcional)
 */

// Almacén en memoria compartido entre invocaciones del mismo worker.
// En Vercel serverless cada instancia tiene su propio espacio, pero
// para el propósito de este reto (una sola instancia activa) funciona correctamente.
if (!global._truoraWebhookEvents) {
  global._truoraWebhookEvents = [];
}

export const webhookEvents = global._truoraWebhookEvents;
const MAX_EVENTS = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const receivedAt = new Date().toISOString();
  const body = req.body;

  console.log('=== TRUORA WEBHOOK RECEIVED ===');
  console.log('Timestamp:', receivedAt);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(body, null, 2));
  console.log('================================');

  // Guardar en el store en memoria para polling del frontend
  const event = {
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    receivedAt,
    headers: {
      'content-type': req.headers['content-type'],
      'x-truora-signature': req.headers['x-truora-signature'] || null,
    },
    body,
  };

  webhookEvents.unshift(event);
  if (webhookEvents.length > MAX_EVENTS) {
    webhookEvents.splice(MAX_EVENTS);
  }

  // Truora espera una respuesta 200 rápida.
  // Si tardas en responder, Truora reintentará el envío.
  return res.status(200).json({
    received: true,
    timestamp: receivedAt,
    message: 'Webhook processed successfully',
  });
}
