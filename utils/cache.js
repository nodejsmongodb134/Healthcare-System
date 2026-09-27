// utils/cache.js
// Simple in-memory TTL cache. No dependencies.
// Used for dashboard counts where a 30s delay is acceptable.

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMs = 30000) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

function invalidate(prefix) {
  if (!prefix) { store.clear(); return; }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

function size() { return store.size; }

module.exports = { get, set, invalidate, size };
