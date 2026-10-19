import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { PaperTypeClient } from "../src/client.js";
import { createServer } from "../src/server.js";

export const BASE = "https://papertype.test";
export const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n%fake\n%%EOF\n");

/** Create a server + MCP client pair over an in-memory transport. */
export async function connect(outputDir: string) {
  const api = new PaperTypeClient({ apiKey: "dp_test_key", baseUrl: BASE });
  const server = createServer({ client: api, outputDir });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcp = new Client({ name: "test-client", version: "0.0.0" });
  await mcp.connect(clientTransport);
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> =>
    (await mcp.callTool({ name, arguments: args })) as CallToolResult;
  const close = async () => {
    await mcp.close();
    await server.close();
  };
  return { mcp, api, call, close };
}

export function textOf(r: CallToolResult): string {
  return r.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

export async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "papertype-mcp-test-"));
}

export function pdfResponse(headers: Record<string, string> = {}): Response {
  return new Response(PDF_BYTES, {
    status: 200,
    headers: { "Content-Type": "application/pdf", "X-Pages": "3", "X-Quota-Used": "4", "X-Quota-Limit": "50", ...headers },
  });
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const ME_FREE = { email: "dev@example.com", plan: "free", quota: 50, used_this_month: 4, watermark: true };
export const ME_PAID = { email: "dev@example.com", plan: "starter", quota: 500, used_this_month: 4, watermark: false };

export type FetchMock = ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

/**
 * Stub globalThis.fetch with a router keyed by URL path. Each handler receives the
 * Request init so tests can inspect the body/headers sent to the API.
 */
export function stubFetch(routes: Record<string, (init: RequestInit | undefined, url: string) => Response | Promise<Response>>): FetchMock {
  const mock = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(url).pathname;
    const handler = routes[pathname];
    if (!handler) throw new Error(`unexpected fetch to ${url}`);
    return handler(init, url);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

export function sentBody(mock: FetchMock, callIndex = 0): Record<string, unknown> {
  const init = mock.mock.calls[callIndex][1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

export function sentHeaders(mock: FetchMock, callIndex = 0): Headers {
  return new Headers(mock.mock.calls[callIndex][1]?.headers);
}
