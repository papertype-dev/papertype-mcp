import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("fails with a clear message pointing at signup when the key is missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ PAPERTYPE_API_KEY: "   " })).toThrow(/PAPERTYPE_API_KEY is not set/);
    expect(() => loadConfig({})).toThrow(/https:\/\/papertype\.dev\/signup/);
  });

  it("applies defaults", () => {
    const c = loadConfig({ PAPERTYPE_API_KEY: "dp_x" });
    expect(c.apiKey).toBe("dp_x");
    expect(c.baseUrl).toBe("https://papertype.dev");
    expect(c.outputDir).toBe(path.resolve(path.join(os.tmpdir(), "papertype")));
  });

  it("honours overrides and strips trailing slashes", () => {
    const c = loadConfig({ PAPERTYPE_API_KEY: " dp_y ", PAPERTYPE_BASE_URL: "http://localhost:8900/", PAPERTYPE_OUTPUT_DIR: "/var/tmp/out" });
    expect(c.apiKey).toBe("dp_y");
    expect(c.baseUrl).toBe("http://localhost:8900");
    expect(c.outputDir).toBe("/var/tmp/out");
  });

  it("rejects a base URL without a scheme", () => {
    expect(() => loadConfig({ PAPERTYPE_API_KEY: "dp_x", PAPERTYPE_BASE_URL: "papertype.dev" })).toThrow(/http/);
  });
});
