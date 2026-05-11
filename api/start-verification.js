/**
 * POST /api/start-verification
 *
 * Serverless function (Vercel) que orquesta:
 *  1. Crear un account_id en Truora (auto-generado)
 *  2. Generar el Web Integration Token (api-key)
 *  3. Devolver el process link al frontend
 *
 * Variables de entorno requeridas (Vercel → Settings → Environment Variables):
 *   TRUORA_API_KEY   →  Tu Truora-API-Key
 *   TRUORA_FLOW_ID   →  El flow_id creado en el dashboard de Truora
 *   VERCEL_URL       →  URL pública del sitio (se auto-inyecta en Vercel)
 */

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const TRUORA_API_KEY = process.env.TRUORA_API_KEY;
  const FLOW_ID = process.env.TRUORA_FLOW_ID;

  if (!TRUORA_API_KEY || !FLOW_ID) {
    return res.status(500).json({
      error: 'Missing environment variables: TRUORA_API_KEY and/or TRUORA_FLOW_ID',
    });
  }

  // ────────────────────────────────────────────────────
  // PASO 1: Crear Account ID (auto-generado por Truora)
  // POST https://api.validations.truora.com/v1/accounts
  // Sin body → Truora genera un account_id aleatorio
  // ────────────────────────────────────────────────────
  let accountId;
  try {
    const accountRes = await fetch('https://api.validations.truorastaging.com/v1/accounts', {
      method: 'POST',
      headers: {
        'Truora-API-Key': TRUORA_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: '', // vacío → Truora genera account_id automáticamente
    });

    if (!accountRes.ok) {
      const errBody = await accountRes.text();
      console.error('[start-verification] Account creation failed:', errBody);
      return res.status(accountRes.status).json({
        error: 'Failed to create account',
        details: errBody,
        step: 'create_account',
      });
    }

    const accountData = await accountRes.json();
    accountId = accountData.account_id;

    if (!accountId) {
      return res.status(500).json({ error: 'No account_id in response', step: 'create_account' });
    }
  } catch (err) {
    console.error('[start-verification] Network error (create account):', err);
    return res.status(500).json({ error: err.message, step: 'create_account' });
  }

  // ────────────────────────────────────────────────────
  // PASO 2: Generar Web Integration Token
  // POST https://api.account.truora.com/v1/api-keys
  // ────────────────────────────────────────────────────
  let webToken;
  try {
    // URL de redirect: hacia la misma página para ver el resultado
    const redirectBase = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.APP_URL || 'https://localhost:3000';

    const params = new URLSearchParams({
      key_type: 'web',
      grant: 'digital-identity',
      api_key_version: '1',
      country: 'ALL',
      flow_id: FLOW_ID,
      account_id: accountId,
      redirect_url: `${redirectBase}/`,
    });

    const tokenRes = await fetch('https://api.account.truorastaging.com/v1/api-keys', {
      method: 'POST',
      headers: {
        'Truora-API-Key': TRUORA_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[start-verification] Token generation failed:', errBody);
      return res.status(tokenRes.status).json({
        error: 'Failed to generate web integration token',
        details: errBody,
        step: 'generate_token',
        account_id: accountId,
      });
    }

    const tokenData = await tokenRes.json();
    webToken = tokenData.api_key;

    if (!webToken) {
      return res.status(500).json({
        error: 'No api_key in token response',
        step: 'generate_token',
        account_id: accountId,
      });
    }
  } catch (err) {
    console.error('[start-verification] Network error (generate token):', err);
    return res.status(500).json({ error: err.message, step: 'generate_token', account_id: accountId });
  }

  // ────────────────────────────────────────────────────
  // Respuesta exitosa
  // ────────────────────────────────────────────────────
  const processUrl = `https://identity.truorastaging.com/?token=${webToken}`;

  return res.status(200).json({
    account_id: accountId,
    token: webToken,
    process_url: processUrl,
  });
}
