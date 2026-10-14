import test from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../src/server.js';
import { BinStore, LIMITS } from '../src/bins.js';

async function start(opts = {}) {
  const server = createServer(opts);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, close: () => new Promise((r) => server.close(r)) };
}

async function newBin(base) {
  const res = await fetch(`${base}/api/bins`, { method: 'POST' });
  assert.equal(res.status, 201);
  return res.json();
}

test('a bin records method, path, query, headers in order, and the exact body', async () => {
  const { base, close } = await start();
  const bin = await newBin(base);
  assert.match(bin.url, /\/in\/[a-z2-9]{16}$/);

  const body = '{"type":"payment_intent.succeeded","amount":2000}';
  const res = await fetch(`${bin.url}/stripe/hook?x=1&y=2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=abc' },
    body,
  });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok\n');

  const got = await (await fetch(`${base}/api/bins/${bin.id}`)).json();
  assert.equal(got.requests.length, 1);
  const r = got.requests[0];
  assert.equal(r.method, 'POST');
  assert.equal(r.path, '/stripe/hook');
  assert.equal(r.query, 'x=1&y=2');
  assert.equal(r.body, body);
  assert.equal(r.bodyBase64, null);
  assert.equal(r.size, Buffer.byteLength(body));
  assert.ok(r.headers.some(([n, v]) => n === 'Stripe-Signature' && v === 't=1,v1=abc'), 'keeps header case');
  await close();
});

test('binary bodies come back as base64, byte for byte', async () => {
  const { base, close } = await start();
  const bin = await newBin(base);
  const bytes = Buffer.from([0xff, 0x00, 0xfe, 0x80]);
  await fetch(bin.url, { method: 'PUT', body: bytes });
  const r = (await (await fetch(`${base}/api/bins/${bin.id}`)).json()).requests[0];
  assert.equal(r.body, null);
  assert.deepEqual(Buffer.from(r.bodyBase64, 'base64'), bytes);
  await close();
});

test('a UTF-8 byte order mark is kept, so signatures over the raw body still match', async () => {
  const { base, close } = await start();
  const bin = await newBin(base);
  await fetch(bin.url, { method: 'POST', body: '﻿{"a":1}' });
  const r = (await (await fetch(`${base}/api/bins/${bin.id}`)).json()).requests[0];
  assert.equal(r.body, '﻿{"a":1}');
  await close();
});

test('bodies over the limit are truncated and flagged', async () => {
  const { base, close } = await start();
  const bin = await newBin(base);
  const big = 'a'.repeat(LIMITS.bodyBytes + 10);
  await fetch(bin.url, { method: 'POST', body: big });
  const r = (await (await fetch(`${base}/api/bins/${bin.id}`)).json()).requests[0];
  assert.equal(r.truncated, true);
  assert.equal(r.size, big.length);
  assert.equal(r.body.length, LIMITS.bodyBytes);
  await close();
});

test('the response status can be set, to watch a provider retry', async () => {
  const { base, close } = await start();
  const bin = await newBin(base);
  const patch = await fetch(`${base}/api/bins/${bin.id}`, { method: 'PATCH', body: JSON.stringify({ status: 503 }) });
  assert.equal(patch.status, 200);
  const res = await fetch(bin.url, { method: 'POST', body: 'x' });
  assert.equal(res.status, 503);
  const bad = await fetch(`${base}/api/bins/${bin.id}`, { method: 'PATCH', body: JSON.stringify({ status: 99 }) });
  assert.equal(bad.status, 400);
  await close();
});

test('malformed bin IDs answer 404, never a capture', async () => {
  const { base, close } = await start();
  assert.equal((await fetch(`${base}/in/not-an-id`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${base}/in/../../etc/passwd`)).status, 404);
  assert.equal((await fetch(`${base}/api/bins/nope`)).status, 404);
  await close();
});

test('requests are forgotten after an hour without activity, but the URL keeps working', async () => {
  let t = 1_000_000;
  const store = new BinStore({ now: () => t });
  const { base, close } = await start({ store });
  const bin = await newBin(base);
  await fetch(bin.url, { method: 'POST', body: 'one' });
  t += LIMITS.idleMs - 1;
  assert.equal((await (await fetch(`${base}/api/bins/${bin.id}`)).json()).requests.length, 1);
  t += LIMITS.idleMs;
  const later = await fetch(`${base}/api/bins/${bin.id}`);
  assert.equal(later.status, 200);
  assert.equal((await later.json()).requests.length, 0);
  await close();
});

test('a URL survives a restart: the new process records to the same ID', async () => {
  const first = await start();
  const bin = await newBin(first.base);
  await first.close();
  const second = await start();
  const res = await fetch(`${second.base}/in/${bin.id}`, { method: 'POST', body: 'after restart' });
  assert.equal(res.status, 200);
  const got = await (await fetch(`${second.base}/api/bins/${bin.id}`)).json();
  assert.equal(got.requests[0].body, 'after restart');
  await second.close();
});

test('a bin keeps only its most recent requests', async () => {
  const { base, close } = await start();
  const bin = await newBin(base);
  for (let i = 0; i < LIMITS.requestsPerBin + 3; i++) await fetch(bin.url, { method: 'POST', body: String(i) });
  const got = await (await fetch(`${base}/api/bins/${bin.id}`)).json();
  assert.equal(got.requests.length, LIMITS.requestsPerBin);
  assert.equal(got.requests[0].body, String(LIMITS.requestsPerBin + 2));
  await close();
});

test('the stream pushes each new request', async () => {
  const { base, close } = await start();
  const bin = await newBin(base);
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/bins/${bin.id}/stream`, { signal: ctrl.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const reader = res.body.getReader();
  await fetch(bin.url, { method: 'POST', body: 'hello' });
  let text = '';
  while (!text.includes('event: request')) text += new TextDecoder().decode((await reader.read()).value);
  while (!text.endsWith('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
  const data = JSON.parse(text.split('event: request\ndata: ')[1]);
  assert.equal(data.body, 'hello');
  ctrl.abort();
  await close();
});

test('static pages carry a CSP; dotfiles and paths outside public/ are not served', async () => {
  const { base, close } = await start();
  const res = await fetch(`${base}/404.html`);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(`${base}/.git/config`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404);
  await close();
});

test("Slack's url_verification challenge is echoed back", async () => {
  const { base, close } = await start();
  const bin = await newBin(base);
  const res = await fetch(bin.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 't', challenge: 'abc123', type: 'url_verification' }),
  });
  assert.deepEqual(await res.json(), { challenge: 'abc123' });
  await close();
});
