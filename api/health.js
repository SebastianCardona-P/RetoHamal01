/**
 * GET /api/health
 * Health check: verifica que las variables de entorno estén configuradas.
 * Usado por el frontend para habilitar el botón de verificación.
 */
export default function handler(req, res) {
  const hasApiKey = Boolean(process.env.TRUORA_API_KEY);
  const hasFlowId = Boolean(process.env.TRUORA_FLOW_ID);
  const allOk = hasApiKey && hasFlowId;

  return res.status(allOk ? 200 : 503).json({
    ok:              allOk,
    truora_api_key:  hasApiKey ? 'set ✓' : 'MISSING ✗',
    truora_flow_id:  hasFlowId ? 'set ✓' : 'MISSING ✗',
  });
}
