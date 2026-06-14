import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const OLD_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("loadConfig", () => {
  it("uses local Memory OS defaults", () => {
    delete process.env.MEMORY_OS_REDIS_PASSWORD;

    const config = loadConfig();

    expect(config.qdrantUrl).toBe("http://127.0.0.1:6333");
    expect(config.collection).toBe("knowledge_base");
    expect(config.redisHost).toBe("127.0.0.1");
    expect(config.redisPort).toBe(6379);
    expect(config.redisPassword).toBeNull();
    expect(config.embeddingApiBase).toBe("http://127.0.0.1:7485/v1");
    expect(config.embeddingModel).toBe("qwen3-embed-0.6b");
    expect(config.embeddingDims).toBe(1024);
    expect(config.source).toBe("pi-coding-agent");
    expect(config.minScore).toBe(0.35);
    expect(config.maxResults).toBe(3);
    expect(config.injectionEnabled).toBe(true);
    expect(config.captureEnabled).toBe(true);
  });

  it("treats empty Redis password as null", () => {
    process.env.MEMORY_OS_REDIS_PASSWORD = "";
    expect(loadConfig().redisPassword).toBeNull();
  });

  it("allows injection and capture to be disabled independently", () => {
    process.env.MEMORY_OS_INJECTION_ENABLED = "false";
    process.env.MEMORY_OS_CAPTURE_ENABLED = "0";

    const config = loadConfig();

    expect(config.injectionEnabled).toBe(false);
    expect(config.captureEnabled).toBe(false);
  });
});
