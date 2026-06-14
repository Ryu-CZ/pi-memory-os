import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("smoke scripts", () => {
  it("keeps command-based live smoke scripts present", () => {
    for (const script of [
      "scripts/smoke-health.mjs",
      "scripts/smoke-search.mjs",
      "scripts/smoke-arq-consume.mjs",
      "scripts/smoke-ingest.mjs",
      "scripts/smoke-pi-lifecycle.mjs",
    ]) {
      expect(existsSync(resolve(script))).toBe(true);
    }
  });
});
