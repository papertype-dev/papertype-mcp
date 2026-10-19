import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PaperTypeClient, type RenderRequest } from "./client.js";
import { PaperTypeError } from "./errors.js";
import { pickBaseName, writePdf } from "./output.js";
import { TEMPLATE_NAMES, TEMPLATES } from "./templates.js";
import { VERSION } from "./version.js";

export interface ServerOptions {
  client: PaperTypeClient;
  /** Directory for PDFs when the caller gives no output_path. */
  outputDir: string;
}

export const FREE_PLAN_NOTE = "Note: free plan output carries a small papertype.dev mark.";

function text(t: string): CallToolResult {
  return { content: [{ type: "text", text: t }] };
}
function fail(t: string): CallToolResult {
  return { content: [{ type: "text", text: t }], isError: true };
}
function errorText(err: unknown): string {
  if (err instanceof PaperTypeError) return err.message;
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

const renderInputShape = {
  markdown: z
    .string()
    .optional()
    .describe(
      "Markdown source for the document (GitHub-flavoured: headings, lists, tables, fenced code, footnotes, admonitions). Provide exactly one of markdown, html, or template+data.",
    ),
  html: z
    .string()
    .optional()
    .describe(
      "HTML document or fragment to render. A theme wraps it in page styles unless theme is 'none'. Provide exactly one of markdown, html, or template+data.",
    ),
  template: z
    .enum(TEMPLATE_NAMES)
    .optional()
    .describe(
      "Name of a hosted template to fill with `data` instead of writing markdown/html: 'invoice', 'certificate' or 'report'. Call list_templates to see each template's fields and sample data.",
    ),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("JSON object of fields for the chosen template (required when template is set). Shape per template is shown by list_templates."),
  theme: z
    .enum(["clean", "report", "minimal", "letter", "none"])
    .optional()
    .describe(
      "Page style for markdown/html input. 'clean' (default, general documents), 'report' (formal, good with cover+toc), 'minimal' (plain), 'letter' (correspondence), 'none' (HTML only: no theme, just your own CSS). Ignored for templates.",
    ),
  page_size: z.enum(["A4", "Letter", "Legal", "A5"]).optional().describe("Paper size. Default A4. Use 'Letter' for US documents."),
  title: z.string().optional().describe("Document title: used for the PDF metadata, the cover page, and the default output filename."),
  author: z.string().optional().describe("Author shown on the cover page and in PDF metadata."),
  date: z.string().optional().describe("Date text shown on the cover page, e.g. '2026-10-18' or 'October 2026'."),
  cover: z.boolean().optional().describe("Add a cover page with title, author and date (markdown/html). Default false."),
  toc: z.boolean().optional().describe("Add a table of contents built from headings. Markdown input only. Default false."),
  page_numbers: z.boolean().optional().describe("Print page numbers in the footer. Default true."),
  header: z.string().optional().describe("Running header text printed top-right on every page."),
  footer: z.string().optional().describe("Footer text printed bottom-left on every page (e.g. a confidentiality note)."),
  css: z
    .string()
    .optional()
    .describe("Extra CSS appended after the theme (markdown/html). May include @page rules, e.g. '@page { margin: 2cm }'."),
  filename: z
    .string()
    .optional()
    .describe("Suggested file name (e.g. 'invoice-014.pdf'). Used for the saved file's name when output_path is not given."),
  output_path: z
    .string()
    .optional()
    .describe(
      "Where to save the PDF. Omit to get a unique file named after the title under the server's output directory (PAPERTYPE_OUTPUT_DIR, default <tmp>/papertype). An existing directory (or a path ending in '/') saves a uniquely named file inside it. Any other path is used as the exact file name ('.pdf' appended if missing; an existing file is overwritten). Relative paths resolve against the output directory.",
    ),
};

export function createServer(opts: ServerOptions): McpServer {
  const { client, outputDir } = opts;
  const server = new McpServer({ name: "papertype", version: VERSION });

  server.registerTool(
    "render_pdf",
    {
      title: "Render a PDF with PaperType",
      description:
        "Render a PDF from Markdown, HTML, or a hosted template (invoice, certificate, report) using the PaperType API, " +
        "and save it to disk. Returns the absolute file path, page count and remaining quota; the PDF bytes are never returned inline. " +
        "Provide exactly one source: `markdown`, `html`, or `template` + `data`. Each call uses one document of the account's monthly quota.",
      inputSchema: renderInputShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args): Promise<CallToolResult> => {
      const { output_path, ...fields } = args;
      if (fields.data !== undefined && fields.template === undefined) {
        return fail("`data` was given without `template`. Set template to 'invoice', 'certificate' or 'report', or drop `data`.");
      }
      const sources = [fields.markdown !== undefined, fields.html !== undefined, fields.template !== undefined].filter(Boolean).length;
      if (sources === 0) {
        return fail("No document source given. Provide exactly one of `markdown`, `html`, or `template` + `data`.");
      }
      if (sources > 1) {
        return fail("More than one document source given. Provide exactly one of `markdown`, `html`, or `template` + `data`.");
      }
      if (fields.template !== undefined && fields.data === undefined) {
        return fail(`Template '${fields.template}' needs a \`data\` object. Call list_templates to see its fields and a sample.`);
      }
      if (typeof fields.markdown === "string" && fields.markdown.trim() === "") return fail("`markdown` is empty.");
      if (typeof fields.html === "string" && fields.html.trim() === "") return fail("`html` is empty.");

      const body: RenderRequest = { ...fields };
      let result;
      try {
        result = await client.render(body);
      } catch (err) {
        return fail(errorText(err));
      }

      let savedPath: string;
      try {
        savedPath = await writePdf(result.pdf, outputDir, pickBaseName(fields), output_path);
      } catch (err) {
        return fail(
          `The PDF rendered (${result.pages ?? "?"} pages, quota used) but could not be written to disk: ${errorText(err)}. ` +
            `Check PAPERTYPE_OUTPUT_DIR / output_path permissions.`,
        );
      }

      const lines = [`Saved PDF: ${savedPath}`, `Pages: ${result.pages ?? "unknown (X-Pages header missing)"}`];
      let planLabel = "";
      let watermarkNote: string | null = null;
      try {
        const acct = await client.account();
        planLabel = acct.plan ? ` (${acct.plan} plan)` : "";
        if (acct.watermark) watermarkNote = FREE_PLAN_NOTE;
      } catch (err) {
        watermarkNote = `Could not check the account plan (/v1/me): ${errorText(err)}`;
      }
      if (result.quotaUsed !== null && result.quotaLimit !== null) {
        lines.push(`Quota this month: ${result.quotaUsed} of ${result.quotaLimit} documents used${planLabel}`);
      } else {
        lines.push(`Quota this month: unknown (X-Quota-Used/X-Quota-Limit headers missing)${planLabel}`);
      }
      if (watermarkNote) lines.push(watermarkNote);
      return text(lines.join("\n"));
    },
  );

  server.registerTool(
    "list_templates",
    {
      title: "List PaperType templates",
      description:
        "List the hosted PDF templates available to render_pdf (invoice, certificate, report) with a description, " +
        "the fields each accepts (name, type, required) and a complete sample `data` object you can adapt. No network call; uses no quota.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (): Promise<CallToolResult> => {
      const intro = TEMPLATES.map((t) => `- ${t.name} (${t.orientation}): ${t.description}`).join("\n");
      const detail = TEMPLATES.map((t) => ({
        name: t.name,
        orientation: t.orientation,
        description: t.description,
        usage: { template: t.name, data: "<object with the fields below>" },
        fields: t.fields,
        sample_data: t.sample,
      }));
      return text(
        `Hosted templates for render_pdf (pass as template + data):\n${intro}\n\n` +
          `Field reference and sample data (JSON):\n${JSON.stringify(detail, null, 2)}\n\n` +
          `Live reference pages: ${client.baseUrl}/templates/<name>`,
      );
    },
  );

  server.registerTool(
    "account",
    {
      title: "PaperType account status",
      description:
        "Show the PaperType account behind the configured API key: email, plan, monthly document quota, documents used this month, " +
        "and whether output carries the free-plan mark. Uses no quota.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (): Promise<CallToolResult> => {
      try {
        const acct = await client.me();
        const lines = [JSON.stringify(acct, null, 2)];
        if (acct.watermark) lines.push(FREE_PLAN_NOTE);
        return text(lines.join("\n"));
      } catch (err) {
        return fail(errorText(err));
      }
    },
  );

  return server;
}
