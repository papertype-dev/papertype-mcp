import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaperTypeClient } from "../src/client.js";
import { PaperTypeError, detailToText } from "../src/errors.js";
import { BASE, connect, jsonResponse, stubFetch, textOf, tmpDir } from "./helpers.js";

let dir: string;
let session: Awaited<ReturnType<typeof connect>>;

beforeEach(async () => {
  dir = await tmpDir();
  session = await connect(dir);
});
afterEach(async () => {
  await session.close();
  vi.unstubAllGlobals();
  await fs.rm(dir, { recursive: true, force: true });
});

const cases: Array<{ status: number; detail: unknown; expect: RegExp[] }> = [
  {
    status: 401,
    detail: "Missing or invalid API key. Send 'Authorization: Bearer dp_...'.",
    expect: [/HTTP 401/, /Missing or invalid API key/, /PAPERTYPE_API_KEY/, /papertype\.test\/signup/],
  },
  { status: 400, detail: "Provide 'html', 'markdown', or 'template' + 'data'.", expect: [/HTTP 400/, /Provide 'html'/] },
  { status: 413, detail: "Input too large (max 2 MB).", expect: [/HTTP 413/, /Input too large \(max 2 MB\)/] },
  { status: 422, detail: "Template 'invoice': missing required field 'items'", expect: [/HTTP 422/, /could not render/, /missing required field 'items'/] },
  {
    status: 422,
    detail: [{ loc: ["body", "data", "items"], msg: "Field required", type: "missing" }],
    expect: [/HTTP 422/, /data\.items: Field required/],
  },
  {
    status: 429,
    detail: "Monthly quota reached (50 documents on the Free plan). Upgrade at https://papertype.dev/account.",
    expect: [/HTTP 429/, /Monthly quota reached/, /Upgrade at/],
  },
  { status: 500, detail: "Internal Server Error", expect: [/HTTP 500/, /Internal Server Error/] },
];

describe("render_pdf maps API errors to tool errors with the server detail", () => {
  for (const c of cases) {
    it(`HTTP ${c.status}`, async () => {
      stubFetch({ "/v1/pdf": () => jsonResponse(c.status, { detail: c.detail }) });
      const r = await session.call("render_pdf", { markdown: "# x" });
      expect(r.isError).toBe(true);
      const out = textOf(r);
      for (const re of c.expect) expect(out).toMatch(re);
      expect(out).not.toMatch(/Saved PDF/);
    });
  }

  it("handles a non-JSON error body", async () => {
    stubFetch({ "/v1/pdf": () => new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }) });
    const r = await session.call("render_pdf", { markdown: "# x" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/HTTP 502/);
    expect(textOf(r)).toMatch(/Bad Gateway/);
  });

  it("handles an empty 200 body", async () => {
    stubFetch({ "/v1/pdf": () => new Response(new Uint8Array(0), { status: 200, headers: { "Content-Type": "application/pdf" } }) });
    const r = await session.call("render_pdf", { markdown: "# x" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/empty response body/);
  });

  it("reports network failures with the cause and base URL", async () => {
    const err = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw err;
      }),
    );
    const r = await session.call("render_pdf", { markdown: "# x" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/Could not reach PaperType at https:\/\/papertype\.test\/v1\/pdf: ECONNREFUSED/);
  });

  it("reports timeouts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const e = new Error("The operation was aborted due to timeout");
        e.name = "TimeoutError";
        throw e;
      }),
    );
    const r = await session.call("render_pdf", { markdown: "# x" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/timed out/);
  });

  it("account tool surfaces a 401 as a tool error", async () => {
    stubFetch({ "/v1/me": () => jsonResponse(401, { detail: "Missing or invalid API key." }) });
    const r = await session.call("account");
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/HTTP 401/);
  });
});

describe("PaperTypeClient / errors unit", () => {
  it("throws PaperTypeError with status and detail", async () => {
    stubFetch({ "/v1/pdf": () => jsonResponse(429, { detail: "quota" }) });
    const c = new PaperTypeClient({ apiKey: "dp_x", baseUrl: BASE });
    await expect(c.render({ markdown: "x" })).rejects.toMatchObject({ name: "PaperTypeError", status: 429, detail: "quota" });
    expect(new PaperTypeError("m", 0)).toBeInstanceOf(Error);
  });

  it("drops undefined fields from the request body", async () => {
    const m = stubFetch({ "/v1/pdf": () => new Response(new Uint8Array([1]), { status: 200 }) });
    const c = new PaperTypeClient({ apiKey: "dp_x", baseUrl: BASE });
    await c.render({ markdown: "x", title: undefined, cover: false });
    expect(JSON.parse(String(m.mock.calls[0][1]?.body))).toEqual({ markdown: "x", cover: false });
  });

  it("detailToText handles strings, lists, objects and null", () => {
    expect(detailToText("s", "f")).toBe("s");
    expect(detailToText(null, "f")).toBe("f");
    expect(detailToText([{ loc: ["body", "theme"], msg: "bad" }, "plain"], "f")).toBe("theme: bad; plain");
    expect(detailToText({ error: "x" }, "f")).toBe('{"error":"x"}');
  });
});
