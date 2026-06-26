// Netlify serverless function — proxies Zoho Inventory API calls
// to avoid browser CORS restrictions.

exports.handler = async (event) => {
  // CORS preflight
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // GET request → return version info so you can verify deployment
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 'v4-zohoapis', dc_map: 'www.zohoapis.{dc}/inventory/v1' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { dc, token, orgId, path } = body;

  if (!dc || !token || !path) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing dc, token, or path' }) };
  }

  const DC_MAP = {
    'in':     'www.zohoapis.in',
    'com':    'www.zohoapis.com',
    'eu':     'www.zohoapis.eu',
    'com.au': 'www.zohoapis.com.au',
    'jp':     'www.zohoapis.jp',
  };

  const apiHost = DC_MAP[dc];
  if (!apiHost) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Unknown dc: ${dc}` }) };
  }

  const url = `https://${apiHost}/inventory/v1/${path}`;

  const reqHeaders = {
    'Authorization': `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json',
  };
  if (orgId) reqHeaders['X-com-zoho-inventory-organizationid'] = String(orgId);

  try {
    const resp = await fetch(url, { headers: reqHeaders });
    const contentType = resp.headers.get('content-type') || '';

    // Image: convert to base64 so we can return it as JSON
    if (contentType.startsWith('image/')) {
      const buf    = await resp.arrayBuffer();
      const base64 = Buffer.from(buf).toString('base64');
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ _type: 'image', base64, contentType }),
      };
    }

    const text = await resp.text();
    return {
      statusCode: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: text,
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
