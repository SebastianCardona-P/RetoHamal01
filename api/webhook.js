/**
 * POST /api/webhook
 *
 * Endpoint receptor de webhooks de Truora.
 * Truora envía un POST con un JWT firmado cuando ocurre un evento
 * (proceso completado, validación fallida, etc.).
 *
 * En producción deberías:
 *  1. Verificar la firma del JWT con el secret que te da Truora
 *  2. Guardar el evento en tu base de datos
 *  3. Notificar a tu sistema de negocio
 *
 * Para este reto, loguea el payload y responde 200 OK.
 *
 * Variables de entorno recomendadas:
 *   WEBHOOK_SECRET  →  Secret para verificar la firma JWT de Truora (opcional)
 */

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

  // Truora espera una respuesta 200 rápida.
  // Si tardas en responder, Truora reintentará el envío.
  return res.status(200).json({
    received: true,
    timestamp: receivedAt,
    message: 'Webhook processed successfully',
  });
}
