// whatiswebhook.com: the static field guide in public/, plus the webhook
// tester's small API. No dependencies.
//
//   POST   /api/bins                 create a bin
//   GET    /api/bins/:id             the bin and its captured requests
//   PATCH  /api/bins/:id             {"status": 500, "delayMs": 3000}: how /in/ answers
//   DELETE /api/bins/:id/requests    forget the captured requests
//   GET    /api/bins/:id/stream      server-sent events, one per new request
//   ANY    /in/:id[/any/path]        the webhook URL: records the request

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BinStore, ID_PATTERN, LIMITS, isTransitHeader, newId, publicBin, publicEntry } from './bins.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

const BIN_CREATES_PER_HOUR = 30;

function slackChallenge(body) {
  if (!body || !body.includes('url_verification')) return null;
  try {
    const j = JSON.parse(body);
    return j && j.type === 'url_verification' && typeof j.challenge === 'string' ? j.challenge : null;
  } catch {
    return null;
  }
}

export function createServer({ store = new BinStore(), origin = process.env.PUBLIC_ORIGIN } = {}) {
  const creates = new Map();

  function clientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return fwd.split(',')[0].trim();
    return req.socket.remoteAddress || '';
  }

  function originOf(req) {
    if (origin) return origin.replace(/\/$/, '');
    const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
    return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  }

  function allowCreate(ip) {
    const t = store.now();
    const w = creates.get(ip);
    if (!w || t - w.start >= 3600000) {
      creates.set(ip, { start: t, count: 1 });
      if (creates.size > 50000) creates.clear();
      return true;
    }
    w.count += 1;
    return w.count <= BIN_CREATES_PER_HOUR;
  }

  function json(res, status, body) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(JSON.stringify(body));
  }

  async function readBody(req, max) {
    const chunks = [];
    let kept = 0;
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (kept < max) {
        const part = chunk.subarray(0, max - kept);
        chunks.push(part);
        kept += part.length;
      }
    }
    return { buf: Buffer.concat(chunks), size, truncated: size > kept };
  }

  async function readJson(req) {
    const { buf, truncated } = await readBody(req, 4096);
    if (truncated) throw new SyntaxError('body too large');
    return buf.length ? JSON.parse(buf.toString('utf8')) : {};
  }

  const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

  async function capture(req, res, id, rest) {
    const bin = store.revive(id);
    if (!bin) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' });
      res.end('Not a webhook URL. Get one at /webhook-tester.html\n');
      return;
    }
    if (!store.allowCapture(bin)) {
      res.writeHead(429, { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' });
      res.end(`Too many requests: this URL records at most ${store.limits.capturesPerMinute} a minute.\n`);
      return;
    }
    const started = store.now();
    const { buf, size, truncated } = await readBody(req, store.limits.bodyBytes);
    let body = null;
    let bodyBase64 = null;
    try {
      body = utf8.decode(buf);
    } catch {
      bodyBase64 = buf.toString('base64');
    }
    const headers = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      headers.push([req.rawHeaders[i], req.rawHeaders[i + 1], isTransitHeader(req.rawHeaders[i])]);
    }
    const q = req.url.indexOf('?');
    const entry = {
      id: newId(10),
      receivedAt: new Date(started).toISOString(),
      method: req.method,
      path: rest || '/',
      query: q >= 0 ? req.url.slice(q + 1) : '',
      httpVersion: req.httpVersion,
      ip: clientIp(req),
      headers,
      contentType: req.headers['content-type'] || '',
      size,
      truncated,
      body,
      bodyBase64,
      response: { ...bin.respond },
    };
    store.record(bin, entry);

    const { status, delayMs } = bin.respond;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const head = {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
    };
    if (req.method === 'OPTIONS') {
      head['access-control-allow-methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
      head['access-control-allow-headers'] = req.headers['access-control-request-headers'] || '*';
    }
    // Slack's Events API verifies a URL by sending a challenge it expects back.
    const challenge = status < 300 && slackChallenge(body);
    if (challenge) {
      head['content-type'] = 'application/json; charset=utf-8';
      res.writeHead(200, head);
      return res.end(JSON.stringify({ challenge }));
    }
    res.writeHead(status, head);
    res.end(status < 300 ? 'ok\n' : `Simulated ${status}, set in the webhook tester.\n`);
  }

  function stream(req, res, bin) {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    const send = (entry) => {
      if (entry === null) {
        res.write('event: expired\ndata: {}\n\n');
        res.end();
        return;
      }
      res.write(`event: request\ndata: ${JSON.stringify(publicEntry(entry))}\n\n`);
    };
    bin.listeners.add(send);
    store.touch(bin);
    const beat = setInterval(() => {
      store.touch(bin);
      res.write(': keep-alive\n\n');
    }, 15000);
    req.on('close', () => {
      clearInterval(beat);
      bin.listeners.delete(send);
    });
  }

  async function api(req, res, parts) {
    // parts: ['bins'] | ['bins', id] | ['bins', id, 'requests' | 'stream']
    if (parts[0] !== 'bins') return json(res, 404, { error: 'not found' });
    if (parts.length === 1) {
      if (req.method !== 'POST') return json(res, 405, { error: 'use POST' });
      if (!allowCreate(clientIp(req))) return json(res, 429, { error: `at most ${BIN_CREATES_PER_HOUR} new URLs an hour` });
      const bin = store.create();
      return json(res, 201, publicBin(bin, store, originOf(req)));
    }
    // A forgotten bin comes back empty, so a URL keeps working across restarts.
    const known = store.get(parts[1]);
    if (!known && ID_PATTERN.test(parts[1]) && !allowCreate(clientIp(req))) {
      return json(res, 429, { error: `at most ${BIN_CREATES_PER_HOUR} new URLs an hour` });
    }
    const bin = known ?? store.revive(parts[1]);
    if (!bin) return json(res, 404, { error: 'no such bin' });
    if (parts.length === 2) {
      if (req.method === 'GET') {
        store.touch(bin);
        return json(res, 200, publicBin(bin, store, originOf(req)));
      }
      if (req.method === 'PATCH') {
        try {
          const body = await readJson(req);
          store.setResponse(bin, { status: body.status, delayMs: body.delayMs });
        } catch (e) {
          return json(res, 400, { error: e.message });
        }
        return json(res, 200, publicBin(bin, store, originOf(req)));
      }
      return json(res, 405, { error: 'use GET or PATCH' });
    }
    if (parts.length === 3 && parts[2] === 'requests' && req.method === 'DELETE') {
      store.clear(bin);
      return json(res, 200, publicBin(bin, store, originOf(req)));
    }
    if (parts.length === 3 && parts[2] === 'stream' && req.method === 'GET') return stream(req, res, bin);
    return json(res, 404, { error: 'not found' });
  }

  async function sendFile(res, path, status = 200) {
    const type = TYPES[extname(path)] || 'application/octet-stream';
    const data = await readFile(path);
    const head = {
      'content-type': type,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'cache-control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600',
    };
    if (type.startsWith('text/html')) {
      head['content-security-policy'] = CSP;
      head['x-frame-options'] = 'DENY';
    }
    res.writeHead(status, head);
    res.end(data);
  }

  async function staticFile(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      return res.end();
    }
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      rel = '/';
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const full = normalize(join(PUBLIC_DIR, rel));
    if (full.startsWith(PUBLIC_DIR) && !full.slice(PUBLIC_DIR.length).split(sep).some((p) => p.startsWith('.'))) {
      try {
        const s = await stat(full);
        if (s.isFile()) return await sendFile(res, full);
      } catch {}
      // /webhook-tester → /webhook-tester.html
      if (!extname(full)) {
        try {
          const s = await stat(full + '.html');
          if (s.isFile()) return await sendFile(res, full + '.html');
        } catch {}
      }
    }
    return sendFile(res, join(PUBLIC_DIR, '404.html'), 404);
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'in' && parts[1]) {
        const id = parts[1];
        if (!ID_PATTERN.test(id)) return capture(req, res, '', '');
        const prefix = `/in/${id}`;
        return await capture(req, res, id, url.pathname.slice(prefix.length));
      }
      if (parts[0] === 'api') return await api(req, res, parts.slice(1));
      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        return res.end('ok\n');
      }
      return await staticFile(req, res, url.pathname);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('internal error\n');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const store = new BinStore();
  setInterval(() => store.sweep(), 60000).unref();
  const port = Number(process.env.PORT || 8080);
  createServer({ store }).listen(port, '0.0.0.0', () => {
    console.log(`whatiswebhook listening on :${port} (body limit ${LIMITS.bodyBytes} bytes)`);
  });
}
