import Redis from "ioredis";

type MemoryEntry = { value: unknown; expiresAt: number };

const globalForCache = globalThis as unknown as {
  redis?: Redis | null;
  pwMemoryCache?: Map<string, MemoryEntry>;
  pwInflight?: Map<string, Promise<unknown>>;
};

function createRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  try {
    const client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      connectTimeout: 1200,
      enableOfflineQueue: false,
    });
    client.on("error", () => {
      /* cache is optional — never crash the app */
    });
    return client;
  } catch {
    return null;
  }
}

export const redis = globalForCache.redis !== undefined ? globalForCache.redis : createRedis();

if (process.env.NODE_ENV !== "production") globalForCache.redis = redis;

/**
 * L1: memória do processo. Evita ida ao Redis (e ao Postgres) em toda navegação.
 * É o que faz a diferença no `next dev`, onde cada request renderiza de novo.
 */
const memory: Map<string, MemoryEntry> =
  globalForCache.pwMemoryCache ?? (globalForCache.pwMemoryCache = new Map());
const inflight: Map<string, Promise<unknown>> =
  globalForCache.pwInflight ?? (globalForCache.pwInflight = new Map());

const MEMORY_MAX_ENTRIES = 600;

function memoryGet<T>(key: string): T | null {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  // LRU simples: re-insere para mover ao fim da fila.
  memory.delete(key);
  memory.set(key, entry);
  return entry.value as T;
}

function memorySet(key: string, value: unknown, ttlSeconds: number) {
  if (ttlSeconds <= 0) return;
  if (memory.size >= MEMORY_MAX_ENTRIES && !memory.has(key)) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function memoryDeletePrefix(prefix: string) {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
}

async function connectIfNeeded(client: Redis) {
  if (client.status === "wait") await client.connect();
}

async function readRedis<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    await connectIfNeeded(redis);
    const value = await redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const local = memoryGet<T>(key);
  if (local !== null) return local;
  const remote = await readRedis<T>(key);
  if (remote !== null) memorySet(key, remote, 300);
  return remote;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 60) {
  memorySet(key, value, ttlSeconds);
  if (!redis) return;
  try {
    await connectIfNeeded(redis);
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* ignore */
  }
}

export async function cacheDel(...keys: string[]) {
  for (const key of keys) memory.delete(key);
  if (!redis || keys.length === 0) return;
  try {
    await connectIfNeeded(redis);
    await redis.del(...keys);
  } catch {
    /* ignore */
  }
}

/** Invalida por prefixo sem usar KEYS (bloqueante no Redis). */
export async function cacheDelPrefix(prefix: string) {
  memoryDeletePrefix(prefix);
  if (!redis) return;
  try {
    await connectIfNeeded(redis);
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 250);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
  } catch {
    /* ignore */
  }
}

/**
 * Cache com deduplicação de requisições concorrentes (anti-stampede).
 * Uma única consulta ao banco abastece L1, Redis e todas as chamadas simultâneas.
 */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const local = memoryGet<T>(key);
  if (local !== null) return local;

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const task = (async () => {
    const remote = await readRedis<T>(key);
    if (remote !== null) {
      memorySet(key, remote, ttlSeconds);
      return remote;
    }
    const value = await loader();
    if (value !== null && value !== undefined) {
      memorySet(key, value, ttlSeconds);
      if (redis) {
        try {
          await connectIfNeeded(redis);
          await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
        } catch {
          /* ignore */
        }
      }
    }
    return value;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
