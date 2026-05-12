/**
 * GET /api/webhook-events
 *
 * Devuelve los últimos webhooks recibidos por /api/webhook.
 * El frontend hace polling a este endpoint cada 3 segundos para
 * mostrar los eventos en tiempo real en el panel de la UI.
 *
 * Query params:
 *   since  →  ISO timestamp; si se provee, solo devuelve eventos más nuevos
 */

// Referencia al mismo store en memoria que usa webhook.js
if (!global._truoraWebhookEvents) {
  global._truoraWebhookEvents = [];
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { since } = req.query;

  let events = global._truoraWebhookEvents;

  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate)) {
      events = events.filter(e => new Date(e.receivedAt) > sinceDate);
    }
  }

  // Cabeceras para evitar cache
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  return res.status(200).json({
    events,
    count: events.length,
    polledAt: new Date().toISOString(),
  });
}
