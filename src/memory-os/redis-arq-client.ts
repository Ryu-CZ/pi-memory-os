import Redis from "ioredis";
import type { MemoryOSConfig, StoreResult } from "../types.js";

const ARQ_QUEUE = "arq:queue";
const ARQ_JOB_PREFIX = "arq:job:";
const ARQ_EXPIRES_EXTRA_MS = 86_400_000;

export interface RedisLike {
  connect(): Promise<void>;
  psetex(...args: unknown[]): Promise<unknown>;
  zadd(...args: unknown[]): Promise<unknown>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
  disconnect?(): void;
}

export async function closeRedis(redis: RedisLike, connected: boolean): Promise<void> {
  if (connected) {
    await redis.quit();
    return;
  }
  redis.disconnect?.();
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function uint32LE(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function pickleUnicode(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  return concatBytes([ascii("X"), uint32LE(bytes.length), bytes]);
}

function pickleLong(value: number): Uint8Array {
  let n = BigInt(value);
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.push(Number(n & 0xffn));
    n >>= 8n;
  }
  if (bytes.length === 0) bytes.push(0);
  if (bytes[bytes.length - 1] >= 0x80) bytes.push(0);
  return Uint8Array.from([0x8a, bytes.length, ...bytes]);
}

function pickleStringList(values: unknown[]): Uint8Array {
  const items = values.map((value) => pickleUnicode(String(value)));
  return concatBytes([ascii("]("), ...items, ascii("e")]);
}

function pickleValue(value: unknown): Uint8Array {
  if (value === null || value === undefined) return ascii("N");
  if (typeof value === "string") return pickleUnicode(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return pickleLong(value);
  if (Array.isArray(value)) return pickleStringList(value);
  throw new Error(`unsupported ARQ argument type: ${typeof value}`);
}

export function serializeArqJob(functionName: string, args: unknown[], enqueueTimeMs: number): Uint8Array {
  return concatBytes([
    Uint8Array.from([0x80, 0x02]), // Pickle protocol 2, accepted by ARQ's default pickle.loads.
    ascii("}("),
    pickleUnicode("t"), ascii("N"),
    pickleUnicode("f"), pickleUnicode(functionName),
    pickleUnicode("a"), ascii("("), ...args.map(pickleValue), ascii("t"),
    pickleUnicode("k"), ascii("}"),
    pickleUnicode("et"), pickleLong(enqueueTimeMs),
    ascii("u."),
  ]);
}

export async function enqueueArqJob(
  redis: RedisLike,
  functionName: string,
  args: unknown[],
): Promise<StoreResult> {
  let connected = false;
  try {
    await redis.connect();
    connected = true;

    const jobId = crypto.randomUUID().replaceAll("-", "");
    const jobKey = `${ARQ_JOB_PREFIX}${jobId}`;
    const score = Date.now();
    const payload = serializeArqJob(functionName, args, score);

    await redis.psetex(jobKey, ARQ_EXPIRES_EXTRA_MS, Buffer.from(payload));
    await redis.zadd(ARQ_QUEUE, score, jobId);

    return { ok: true, jobId, function: functionName };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await closeRedis(redis, connected);
  }
}

export function createRedisClient(config: MemoryOSConfig): Redis {
  const opts: Record<string, unknown> = {
    host: config.redisHost,
    port: config.redisPort,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  };
  if (config.redisPassword) {
    opts.password = config.redisPassword;
  }
  const client = new Redis(opts);
  client.on("error", () => {
    // Connection failures are reported through operation results; keep ioredis quiet.
  });
  return client;
}
