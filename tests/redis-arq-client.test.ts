import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueArqJob, createRedisClient, serializeArqJob } from "../src/memory-os/redis-arq-client.js";
import type { RedisLike } from "../src/memory-os/redis-arq-client.js";

function makeFakeRedis(): RedisLike & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {};
  return {
    calls,
    connect: vi.fn(async () => {
      calls.connect = [];
    }),
    psetex: vi.fn(async (...args: unknown[]) => {
      calls.psetex = args;
      return 1;
    }),
    zadd: vi.fn(async (...args: unknown[]) => {
      calls.zadd = args;
      return 1;
    }),
    ping: vi.fn(async () => "PONG"),
    quit: vi.fn(async () => {
      calls.quit = [];
    }),
    disconnect: vi.fn(() => {
      calls.disconnect = [];
    }),
  };
}

describe("createRedisClient", () => {
  it("passes undefined for empty password", () => {
    const client = createRedisClient({
      qdrantUrl: "http://127.0.0.1:6333",
      collection: "kb",
      redisHost: "127.0.0.1",
      redisPort: 6379,
      redisPassword: "",
      embeddingApiBase: "http://127.0.0.1:7485/v1",
      embeddingModel: "m",
      embeddingDims: 1024,
      source: "pi",
      minScore: 0.35,
      maxResults: 3,
      hermesStateDbPath: null,
      hermesMemoryStoreDbPath: null,
      sparseDockerDir: null,
      sparsePython: "python3",
      injectionEnabled: true,
      captureEnabled: true,
    });

    // ioredis normalizes missing password to null internally
    expect(client.options.password).toBeFalsy();
  });

  it("passes null password as falsy", () => {
    const client = createRedisClient({
      qdrantUrl: "http://127.0.0.1:6333",
      collection: "kb",
      redisHost: "127.0.0.1",
      redisPort: 6379,
      redisPassword: null,
      embeddingApiBase: "http://127.0.0.1:7485/v1",
      embeddingModel: "m",
      embeddingDims: 1024,
      source: "pi",
      minScore: 0.35,
      maxResults: 3,
      hermesStateDbPath: null,
      hermesMemoryStoreDbPath: null,
      sparseDockerDir: null,
      sparsePython: "python3",
      injectionEnabled: true,
      captureEnabled: true,
    });

    // ioredis normalizes missing password to null internally
    expect(client.options.password).toBeFalsy();
  });

  it("passes real password through", () => {
    const client = createRedisClient({
      qdrantUrl: "http://127.0.0.1:6333",
      collection: "kb",
      redisHost: "127.0.0.1",
      redisPort: 6379,
      redisPassword: "secret",
      embeddingApiBase: "http://127.0.0.1:7485/v1",
      embeddingModel: "m",
      embeddingDims: 1024,
      source: "pi",
      minScore: 0.35,
      maxResults: 3,
      hermesStateDbPath: null,
      hermesMemoryStoreDbPath: null,
      sparseDockerDir: null,
      sparsePython: "python3",
      injectionEnabled: true,
      captureEnabled: true,
    });

    expect(client.options.password).toBe("secret");
  });

  it("uses lazy connect to avoid noisy connection attempts in tests and offline sessions", () => {
    const client = createRedisClient({
      qdrantUrl: "http://127.0.0.1:6333",
      collection: "kb",
      redisHost: "127.0.0.1",
      redisPort: 6379,
      redisPassword: null,
      embeddingApiBase: "http://127.0.0.1:7485/v1",
      embeddingModel: "m",
      embeddingDims: 1024,
      source: "pi",
      minScore: 0.35,
      maxResults: 3,
      hermesStateDbPath: null,
      hermesMemoryStoreDbPath: null,
      sparseDockerDir: null,
      sparsePython: "python3",
      injectionEnabled: true,
      captureEnabled: true,
    });

    expect(client.options.lazyConnect).toBe(true);
  });
});

describe("enqueueArqJob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes an ARQ pickle job string and adds job ID to arq:queue", async () => {
    const fake = makeFakeRedis();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("12345678-1234-1234-1234-123456789abc");

    const result = await enqueueArqJob(fake, "process_ingestion", ["hello world"]);

    expect(result.ok).toBe(true);
    expect(result.jobId).toBe("12345678123412341234123456789abc");
    expect(result.function).toBe("process_ingestion");
    expect(fake.calls.psetex?.[0]).toBe("arq:job:12345678123412341234123456789abc");
    expect(fake.calls.psetex?.[1]).toBe(86_400_000);
    expect(Buffer.isBuffer(fake.calls.psetex?.[2])).toBe(true);
    expect(fake.calls.zadd).toEqual(
      expect.arrayContaining(["arq:queue", "12345678123412341234123456789abc"]),
    );
  });

  it("serializes ARQ job fields with Python pickle-compatible opcodes", () => {
    const payload = Buffer.from(serializeArqJob("reflect", ["arg1", "arg2"], 1_781_383_000_000));

    expect(payload.subarray(0, 2)).toEqual(Buffer.from([0x80, 0x02]));
    expect(payload.toString("utf8")).toContain("reflect");
    expect(payload.toString("utf8")).toContain("arg1");
    expect(payload.toString("utf8")).toContain("arg2");
  });

  it("returns { ok: false, error } on failure", async () => {
    const fake = makeFakeRedis();
    (fake.psetex as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("redis down"));

    const result = await enqueueArqJob(fake, "process_ingestion", ["test"]);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("redis down");
  });

  it("calls quit in finally block", async () => {
    const fake = makeFakeRedis();
    (fake.psetex as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));

    await enqueueArqJob(fake, "process_ingestion", ["test"]);

    expect(fake.quit).toHaveBeenCalled();
  });

  it("calls quit on success too", async () => {
    const fake = makeFakeRedis();

    await enqueueArqJob(fake, "process_ingestion", ["test"]);

    expect(fake.quit).toHaveBeenCalled();
  });

  it("disconnects instead of quit when connect fails", async () => {
    const fake = makeFakeRedis();
    (fake.connect as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connect failed"));

    const result = await enqueueArqJob(fake, "process_ingestion", ["test"]);

    expect(result.ok).toBe(false);
    expect(fake.disconnect).toHaveBeenCalled();
    expect(fake.quit).not.toHaveBeenCalled();
  });
});
