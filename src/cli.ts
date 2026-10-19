#!/usr/bin/env node
/**
 * papertype-mcp: MCP server (stdio transport) for the PaperType PDF API.
 * stdout is reserved for the MCP protocol; all diagnostics go to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PaperTypeClient } from "./client.js";
import { ConfigError, loadConfig, SIGNUP_URL } from "./config.js";
import { createServer } from "./server.js";
import { VERSION } from "./version.js";

const USAGE = `papertype-mcp ${VERSION} - MCP server for PaperType (https://papertype.dev)

Usage: papertype-mcp            start the server on stdio (used by MCP clients)
       papertype-mcp --version  print the version
       papertype-mcp --help     print this help

Environment:
  PAPERTYPE_API_KEY     required. Get a key at ${SIGNUP_URL}
  PAPERTYPE_BASE_URL    default https://papertype.dev
  PAPERTYPE_OUTPUT_DIR  default <os temp dir>/papertype

Docs: https://papertype.dev/docs`;

async function main(argv: string[]): Promise<void> {
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`papertype-mcp: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
  const client = new PaperTypeClient({ apiKey: config.apiKey, baseUrl: config.baseUrl });
  const server = createServer({ client, outputDir: config.outputDir });
  const transport = new StdioServerTransport();
  transport.onerror = (err) => process.stderr.write(`papertype-mcp: transport error: ${err.message}\n`);
  await server.connect(transport);
  process.stderr.write(`papertype-mcp ${VERSION} ready on stdio (api ${config.baseUrl}, output dir ${config.outputDir})\n`);
}

main(process.argv.slice(2)).catch((err: unknown) => {
  process.stderr.write(`papertype-mcp: fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
