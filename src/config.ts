import os from "node:os";
import path from "node:path";

export const DEFAULT_BASE_URL = "https://papertype.dev";
export const SIGNUP_URL = "https://papertype.dev/signup?ref=mcp";

export interface Config {
  apiKey: string;
  baseUrl: string;
  outputDir: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Read configuration from the environment.
 *  - PAPERTYPE_API_KEY   required
 *  - PAPERTYPE_BASE_URL  default https://papertype.dev
 *  - PAPERTYPE_OUTPUT_DIR default <os tmpdir>/papertype
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = (env.PAPERTYPE_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new ConfigError(
      "PAPERTYPE_API_KEY is not set. papertype-mcp needs a PaperType API key (starts with dp_).\n" +
        `Get one at ${SIGNUP_URL}, then set PAPERTYPE_API_KEY in the MCP server's environment, e.g.\n` +
        '  "env": { "PAPERTYPE_API_KEY": "dp_..." }',
    );
  }
  const baseUrl = (env.PAPERTYPE_BASE_URL ?? "").trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new ConfigError(`PAPERTYPE_BASE_URL must start with http:// or https:// (got "${baseUrl}").`);
  }
  const outputDir = (env.PAPERTYPE_OUTPUT_DIR ?? "").trim() || path.join(os.tmpdir(), "papertype");
  return { apiKey, baseUrl, outputDir: path.resolve(outputDir) };
}
