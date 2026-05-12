/**
 * POST /api/webhook
 *
 * Endpoint receptor de webhooks de Truora.
 * Truora envía un POST con un JWT firmado cuando ocurre un evento
 * (proceso completado, validación fallida, etc.).
 *
 * Los eventos se persisten en /tmp/truora-webhook-events.json para
 * que webhook-events.js pueda leerlos en la misma instancia Lambda.
 */

import fs from 'fs';

const EVENTS_FILE = '/tmp/truora-webhook-events.json';
const MAX_EVENTS = 50;

function readEvents() {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
    }
  } catch (_) {}
  return [];
}

function writeEvents(events) {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events), 'utf8');
  } catch (err) {
    console.error('[webhook] Error writing events file:', err.message);
  }
}

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

  // Construir el evento
  const event = {
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    receivedAt,
    headers: {
      'content-type': req.headers['content-type'] || null,
      'x-truora-signature': req.headers['x-truora-signature'] || null,
    },
    body,
  };

  // Leer → prepend → recortar → escribir
  const events = readEvents();
  events.unshift(event);
  if (events.length > MAX_EVENTS) events.splice(MAX_EVENTS);
  writeEvents(events);

  // Truora espera una respuesta 200 rápida.
  return res.status(200).json({
    received: true,
    timestamp: receivedAt,
    message: 'Webhook processed successfully',
  });
}
