// In-memory store for the webhook tester. A bin is a public URL that records
// the requests sent to it. Nothing touches disk: bins live for an hour after
// their last activity (24 hours at most), and vanish when the process
// restarts or the app goes to sleep.

import { randomBytes } from 'node:crypto';

export const LIMITS = {
  idleMs: 60 * 60 * 1000,
  maxAgeMs: 24 * 60 * 60 * 1000,
  requestsPerBin: 50,
  bodyBytes: 256 * 1024,
  totalBytes: 128 * 1024 * 1024,
  bins: 10000,
  capturesPerMinute: 120,
  maxDelayMs: 10000,
};

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function newId(length = 16) {
  const bytes = randomBytes(length);
  let id = '';
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return id;
}

export const ID_PATTERN = /^[a-z2-9]{16}$/;

// Headers that a reverse proxy adds or rewrites on the way in, shown apart
// from the ones the sender set.
const TRANSIT = new Set([
  'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-port',
  'x-forwarded-scheme', 'x-forwarded-server', 'x-real-ip', 'x-request-id',
  'x-scheme', 'forwarded', 'via',
]);

export function isTransitHeader(name) {
  const n = name.toLowerCase();
  return TRANSIT.has(n) || n.startsWith('x-envoy-') || n.startsWith('cf-');
}

export class BinStore {
  constructor({ now = Date.now, limits = LIMITS } = {}) {
    this.now = now;
    this.limits = limits;
    this.bins = new Map();
    this.bytes = 0;
  }

  create() {
    this.sweep();
    while (this.bins.size >= this.limits.bins) this.evictOldest();
    const t = this.now();
    const bin = {
      id: newId(),
      createdAt: t,
      touchedAt: t,
      requests: [],
      bytes: 0,
      respond: { status: 200, delayMs: 0 },
      window: { start: t, count: 0 },
      listeners: new Set(),
    };
    this.bins.set(bin.id, bin);
    return bin;
  }

  get(id) {
    const bin = this.bins.get(id);
    if (!bin) return null;
    if (this.expired(bin)) {
      this.drop(bin);
      return null;
    }
    return bin;
  }

  touch(bin) {
    bin.touchedAt = this.now();
  }

  expiresAt(bin) {
    return Math.min(bin.touchedAt + this.limits.idleMs, bin.createdAt + this.limits.maxAgeMs);
  }

  expired(bin) {
    return this.now() >= this.expiresAt(bin);
  }

  setResponse(bin, { status, delayMs }) {
    if (status !== undefined) {
      if (!Number.isInteger(status) || status < 200 || status > 599) throw new RangeError('status must be an integer from 200 to 599');
      bin.respond.status = status;
    }
    if (delayMs !== undefined) {
      if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > this.limits.maxDelayMs) {
        throw new RangeError(`delayMs must be an integer from 0 to ${this.limits.maxDelayMs}`);
      }
      bin.respond.delayMs = delayMs;
    }
    this.touch(bin);
  }

  // Returns false when the bin has taken its share of requests this minute.
  allowCapture(bin) {
    const t = this.now();
    if (t - bin.window.start >= 60000) bin.window = { start: t, count: 0 };
    bin.window.count += 1;
    return bin.window.count <= this.limits.capturesPerMinute;
  }

  record(bin, entry) {
    const size = entry.size + 2048;
    bin.requests.unshift(entry);
    bin.bytes += size;
    this.bytes += size;
    entry._size = size;
    while (bin.requests.length > this.limits.requestsPerBin) {
      const old = bin.requests.pop();
      bin.bytes -= old._size;
      this.bytes -= old._size;
    }
    this.touch(bin);
    while (this.bytes > this.limits.totalBytes && this.bins.size > 1) this.evictOldest(bin);
    for (const fn of bin.listeners) fn(entry);
  }

  clear(bin) {
    this.bytes -= bin.bytes;
    bin.bytes = 0;
    bin.requests = [];
    this.touch(bin);
  }

  drop(bin) {
    this.bytes -= bin.bytes;
    this.bins.delete(bin.id);
    for (const fn of bin.listeners) fn(null);
    bin.listeners.clear();
  }

  evictOldest(keep) {
    let oldest = null;
    for (const bin of this.bins.values()) {
      if (bin === keep) continue;
      if (!oldest || bin.touchedAt < oldest.touchedAt) oldest = bin;
    }
    if (oldest) this.drop(oldest);
  }

  sweep() {
    for (const bin of this.bins.values()) if (this.expired(bin)) this.drop(bin);
  }
}

// The public shape of one captured request.
export function publicEntry(entry) {
  const { _size, ...rest } = entry;
  return rest;
}

export function publicBin(bin, store, origin) {
  return {
    id: bin.id,
    url: `${origin}/in/${bin.id}`,
    createdAt: new Date(bin.createdAt).toISOString(),
    expiresAt: new Date(store.expiresAt(bin)).toISOString(),
    respond: { ...bin.respond },
    requests: bin.requests.map(publicEntry),
  };
}
