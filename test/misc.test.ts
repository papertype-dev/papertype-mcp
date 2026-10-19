import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickBaseName, slugify } from "../src/output.js";
import { TEMPLATES, templateByName } from "../src/templates.js";
import { FREE_PLAN_NOTE } from "../src/server.js";
import { VERSION } from "../src/version.js";
import { connect, jsonResponse, ME_FREE, ME_PAID, stubFetch, textOf, tmpDir } from "./helpers.js";

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

describe("tool listing", () => {
  it("exposes exactly render_pdf, list_templates and account with descriptions", async () => {
    const { tools } = await session.mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["account", "list_templates", "render_pdf"]);
    const render = tools.find((t) => t.name === "render_pdf")!;
    expect(render.description).toMatch(/Markdown, HTML, or a hosted template/);
    const props = (render.inputSchema as { properties: Record<string, { description?: string; enum?: string[] }> }).properties;
    for (const k of ["markdown", "html", "template", "data", "theme", "page_size", "title", "author", "date", "cover", "toc", "page_numbers", "header", "footer", "css", "filename", "output_path"]) {
      expect(props[k], k).toBeDefined();
      expect(props[k].description, `${k} description`).toBeTruthy();
    }
    expect(props.template.enum).toEqual(["invoice", "certificate", "report"]);
    expect(props.theme.enum).toEqual(["clean", "report", "minimal", "letter", "none"]);
    expect(props.page_size.enum).toEqual(["A4", "Letter", "Legal", "A5"]);
  });
});

describe("list_templates", () => {
  it("returns the three templates with descriptions, fields and sample data, without a network call", async () => {
    const fetchMock = stubFetch({});
    const r = await session.call("list_templates");
    expect(r.isError).toBeFalsy();
    const out = textOf(r);
    for (const name of ["invoice", "certificate", "report"]) expect(out).toContain(`- ${name} (`);
    expect(out).toContain('"number": "INV-2026-014"');
    expect(out).toContain('"recipient": "Maya Okonkwo"');
    expect(out).toContain('"title": "Website Performance Report"');
    expect(out).toContain("https://papertype.test/templates/<name>");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("template catalogue is internally consistent", () => {
    expect(TEMPLATES.map((t) => t.name)).toEqual(["invoice", "certificate", "report"]);
    for (const t of TEMPLATES) {
      for (const f of t.fields.filter((f) => f.required)) {
        expect(t.sample, `${t.name}.${f.name} in sample`).toHaveProperty(f.name);
      }
      for (const key of Object.keys(t.sample)) {
        expect(t.fields.map((f) => f.name), `${t.name} sample key ${key} documented`).toContain(key);
      }
    }
    expect(templateByName("certificate")?.orientation).toBe("landscape");
    expect(templateByName("nope")).toBeUndefined();
  });
});

describe("account", () => {
  it("returns /v1/me as JSON plus the free-plan note", async () => {
    stubFetch({ "/v1/me": () => jsonResponse(200, ME_FREE) });
    const out = textOf(await session.call("account"));
    expect(JSON.parse(out.split("\n").slice(0, -1).join("\n"))).toEqual(ME_FREE);
    expect(out).toContain(FREE_PLAN_NOTE);
  });
  it("omits the note on paid plans", async () => {
    stubFetch({ "/v1/me": () => jsonResponse(200, ME_PAID) });
    const out = textOf(await session.call("account"));
    expect(JSON.parse(out)).toEqual(ME_PAID);
  });
});

describe("naming helpers", () => {
  it("slugify", () => {
    expect(slugify("Q3 Report: Draft!")).toBe("q3-report-draft");
    expect(slugify("Résumé — Jörg.pdf")).toBe("resume-jorg");
    expect(slugify("!!!")).toBe("document");
    expect(slugify("x".repeat(100)).length).toBeLessThanOrEqual(60);
  });
  it("pickBaseName precedence", () => {
    expect(pickBaseName({ filename: "a.pdf", title: "b", markdown: "# c" })).toBe("a");
    expect(pickBaseName({ title: "b", markdown: "# c" })).toBe("b");
    expect(pickBaseName({ markdown: "intro\n\n# C Heading\n" })).toBe("c-heading");
    expect(pickBaseName({ template: "certificate", data: { recipient: "Maya Okonkwo" } })).toBe("certificate-maya-okonkwo");
    expect(pickBaseName({ template: "report", data: {} })).toBe("report");
    expect(pickBaseName({ html: "<p>x</p>" } as never)).toBe("document");
  });
});

describe("version", () => {
  it("matches package.json", () => {
    const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
