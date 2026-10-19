import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_PLAN_NOTE } from "../src/server.js";
import { connect, jsonResponse, ME_FREE, ME_PAID, PDF_BYTES, pdfResponse, sentBody, sentHeaders, stubFetch, textOf, tmpDir } from "./helpers.js";

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

describe("render_pdf success path", () => {
  it("writes the PDF under the output dir, named after the title, and reports pages/quota/watermark", async () => {
    const fetchMock = stubFetch({ "/v1/pdf": () => pdfResponse(), "/v1/me": () => jsonResponse(200, ME_FREE) });
    const r = await session.call("render_pdf", { markdown: "# Hello\n\nWorld", title: "Q3 Report: Draft!", theme: "report", cover: true });
    expect(r.isError).toBeFalsy();
    const out = textOf(r);
    const file = path.join(dir, "q3-report-draft.pdf");
    expect(out).toContain(`Saved PDF: ${file}`);
    expect(out).toContain("Pages: 3");
    expect(out).toContain("Quota this month: 4 of 50 documents used (free plan)");
    expect(out).toContain(FREE_PLAN_NOTE);
    expect(out).not.toContain("%PDF"); // never inline bytes
    expect(new Uint8Array(await fs.readFile(file))).toEqual(PDF_BYTES);

    // request shape
    expect(sentHeaders(fetchMock).get("authorization")).toBe("Bearer dp_test_key");
    expect(sentHeaders(fetchMock).get("content-type")).toBe("application/json");
    expect(fetchMock.mock.calls[0][0]).toBe("https://papertype.test/v1/pdf");
    expect(sentBody(fetchMock)).toEqual({ markdown: "# Hello\n\nWorld", title: "Q3 Report: Draft!", theme: "report", cover: true });
  });

  it("omits the free-plan note on paid plans and caches /v1/me for the process", async () => {
    const fetchMock = stubFetch({ "/v1/pdf": () => pdfResponse(), "/v1/me": () => jsonResponse(200, ME_PAID) });
    const r1 = await session.call("render_pdf", { html: "<h1>One</h1>" });
    const r2 = await session.call("render_pdf", { html: "<h1>Two</h1>" });
    expect(textOf(r1)).not.toContain("papertype.dev mark");
    expect(textOf(r2)).toContain("(starter plan)");
    const meCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/v1/me"));
    expect(meCalls).toHaveLength(1);
  });

  it("does not cache a failed /v1/me and still reports the saved file", async () => {
    let meCalls = 0;
    stubFetch({
      "/v1/pdf": () => pdfResponse(),
      "/v1/me": () => (++meCalls === 1 ? jsonResponse(500, { detail: "boom" }) : jsonResponse(200, ME_FREE)),
    });
    const r1 = await session.call("render_pdf", { markdown: "# A" });
    expect(r1.isError).toBeFalsy();
    expect(textOf(r1)).toContain("Saved PDF:");
    expect(textOf(r1)).toContain("Could not check the account plan");
    const r2 = await session.call("render_pdf", { markdown: "# B" });
    expect(textOf(r2)).toContain(FREE_PLAN_NOTE);
    expect(meCalls).toBe(2);
  });

  it("never overwrites when no output_path is given: second render gets -2 suffix", async () => {
    stubFetch({ "/v1/pdf": () => pdfResponse(), "/v1/me": () => jsonResponse(200, ME_PAID) });
    const a = textOf(await session.call("render_pdf", { markdown: "# Same title" }));
    const b = textOf(await session.call("render_pdf", { markdown: "# Same title" }));
    expect(a).toContain(path.join(dir, "same-title.pdf"));
    expect(b).toContain(path.join(dir, "same-title-2.pdf"));
  });

  it("uses filename, then title, then first heading, then 'document' for the default name", async () => {
    stubFetch({ "/v1/pdf": () => pdfResponse(), "/v1/me": () => jsonResponse(200, ME_PAID) });
    expect(textOf(await session.call("render_pdf", { markdown: "# Head", title: "T", filename: "Invoice 14.pdf" }))).toContain("/invoice-14.pdf");
    expect(textOf(await session.call("render_pdf", { markdown: "# Head", title: "T" }))).toContain("/t.pdf");
    expect(textOf(await session.call("render_pdf", { markdown: "# Head" }))).toContain("/head.pdf");
    expect(textOf(await session.call("render_pdf", { html: "<p>x</p>" }))).toContain("/document.pdf");
  });

  it("honours an explicit output_path file (absolute, relative, missing .pdf, overwrite)", async () => {
    stubFetch({ "/v1/pdf": () => pdfResponse(), "/v1/me": () => jsonResponse(200, ME_PAID) });
    const abs = path.join(dir, "nested", "deep", "out.pdf");
    expect(textOf(await session.call("render_pdf", { markdown: "# x", output_path: abs }))).toContain(`Saved PDF: ${abs}`);
    expect((await fs.stat(abs)).size).toBe(PDF_BYTES.length);

    expect(textOf(await session.call("render_pdf", { markdown: "# x", output_path: "rel/name" }))).toContain(
      `Saved PDF: ${path.join(dir, "rel", "name.pdf")}`,
    );
    // overwrite the same explicit path without error
    const again = await session.call("render_pdf", { markdown: "# x", output_path: abs });
    expect(again.isError).toBeFalsy();
  });

  it("treats an existing directory or trailing slash as a directory", async () => {
    stubFetch({ "/v1/pdf": () => pdfResponse(), "/v1/me": () => jsonResponse(200, ME_PAID) });
    const sub = path.join(dir, "sub");
    await fs.mkdir(sub);
    expect(textOf(await session.call("render_pdf", { markdown: "# In dir", output_path: sub }))).toContain(path.join(sub, "in-dir.pdf"));
    const slash = path.join(dir, "new-dir") + "/";
    expect(textOf(await session.call("render_pdf", { markdown: "# In dir", output_path: slash }))).toContain(path.join(dir, "new-dir", "in-dir.pdf"));
  });

  it("reports missing X-Pages/quota headers instead of inventing numbers", async () => {
    stubFetch({
      "/v1/pdf": () => new Response(PDF_BYTES, { status: 200, headers: { "Content-Type": "application/pdf" } }),
      "/v1/me": () => jsonResponse(200, ME_PAID),
    });
    const out = textOf(await session.call("render_pdf", { markdown: "# x" }));
    expect(out).toContain("Pages: unknown");
    expect(out).toContain("Quota this month: unknown");
  });

  it("fails loudly when the file cannot be written (quota was still used)", async () => {
    stubFetch({ "/v1/pdf": () => pdfResponse(), "/v1/me": () => jsonResponse(200, ME_PAID) });
    const blocker = path.join(dir, "blocker");
    await fs.writeFile(blocker, "not a dir");
    const r = await session.call("render_pdf", { markdown: "# x", output_path: path.join(blocker, "x.pdf") });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/could not be written to disk/);
  });
});

describe("render_pdf template path", () => {
  it("sends template + data untouched and names the file after the template and its title", async () => {
    const fetchMock = stubFetch({ "/v1/pdf": () => pdfResponse({ "X-Pages": "1" }), "/v1/me": () => jsonResponse(200, ME_PAID) });
    const data = { number: "INV-2026-014", date: "2026-10-18", from: { name: "A" }, to: { name: "B" }, items: [{ description: "x", quantity: 1, unit_price: 2 }] };
    const r = await session.call("render_pdf", { template: "invoice", data, page_size: "Letter" });
    expect(r.isError).toBeFalsy();
    expect(sentBody(fetchMock)).toEqual({ template: "invoice", data, page_size: "Letter" });
    expect(textOf(r)).toContain(path.join(dir, "invoice-inv-2026-014.pdf"));
    expect(textOf(r)).toContain("Pages: 1");
  });

  it("rejects template without data, data without template, and unknown template names before any network call", async () => {
    const fetchMock = stubFetch({});
    let r = await session.call("render_pdf", { template: "invoice" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/needs a `data` object/);

    r = await session.call("render_pdf", { data: { a: 1 } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/without `template`/);

    r = await session.call("render_pdf", { template: "letterhead", data: {} });
    expect(r.isError).toBe(true); // zod enum rejects it at the SDK layer
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("render_pdf input validation", () => {
  it("requires exactly one source", async () => {
    const fetchMock = stubFetch({});
    let r = await session.call("render_pdf", { title: "no source" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/No document source/);

    r = await session.call("render_pdf", { markdown: "# a", html: "<p>b</p>" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/More than one document source/);

    r = await session.call("render_pdf", { markdown: "   " });
    expect(r.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
