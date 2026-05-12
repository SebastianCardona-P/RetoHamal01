/**
 * GET /api/webhook-events
 *
 * Lee los últimos webhooks recibidos desde /tmp/truora-webhook-events.json
 * (escrito por /api/webhook) y los devuelve al frontend para polling cada 3s.
 *
 * Query params:
 *   since  →  ISO timestamp; si se provee, solo devuelve eventos más nuevos
 */

import fs from 'fs';

const EVENTS_FILE = '/tmp/truora-webhook-events.json';

function readEvents() {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
    }
  } catch (_) {}
  return [];
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { since } = req.query;

  let events = readEvents();

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
