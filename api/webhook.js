/**
 * /api/webhook
 *
 * Endpoint dual (misma Lambda = memoria compartida garantizada):
 *
 *   POST  →  Receptor de webhooks de Truora
 *            Truora envía un POST cuando ocurre un evento
 *            (proceso creado, exitoso, fallido, etc.)
 *
 *   GET   →  Polling del frontend
 *            Devuelve los últimos eventos recibidos.
 *            Query param: ?since=<ISO timestamp>
 *
 * Al vivir en el mismo archivo, POST y GET comparten el mismo
 * array `webhookEvents` en memoria de Node.js, sin necesitar
 * base de datos ni /tmp.
 */

const MAX_EVENTS = 50;

// Array en memoria a nivel de módulo — compartido entre POST y GET
// dentro de la misma instancia Lambda de Vercel.
const webhookEvents = [];

export default async function handler(req, res) {
  // ─────────────────────────────────────────────────
  // POST /api/webhook  — Truora nos envía el evento
  // ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const receivedAt = new Date().toISOString();
    const body = req.body;

    console.log('=== TRUORA WEBHOOK RECEIVED ===');
    console.log('Timestamp:', receivedAt);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(body, null, 2));
    console.log('================================');

    const event = {
      id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      receivedAt,
      headers: {
        'content-type': req.headers['content-type'] || null,
        'x-truora-signature': req.headers['x-truora-signature'] || null,
      },
      body,
    };

    webhookEvents.unshift(event);
    if (webhookEvents.length > MAX_EVENTS) webhookEvents.splice(MAX_EVENTS);

    // Truora espera 200 rápido; si tardas, reintenta.
    return res.status(200).json({
      received: true,
      timestamp: receivedAt,
      message: 'Webhook processed successfully',
    });
  }

  // ─────────────────────────────────────────────────
  // GET /api/webhook  — El frontend consulta eventos
  // ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { since } = req.query;

    let events = webhookEvents;

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate)) {
        events = events.filter(e => new Date(e.receivedAt) > sinceDate);
      }
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    return res.status(200).json({
      events,
      count: events.length,
      polledAt: new Date().toISOString(),
    });
  }

  // ─────────────────────────────────────────────────
  // Cualquier otro método
  // ─────────────────────────────────────────────────
  return res.status(405).json({ error: 'Method not allowed' });
}
