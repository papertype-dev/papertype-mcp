import fs from "node:fs/promises";
import path from "node:path";

/** "Q3 Report: Draft!" -> "q3-report-draft" (ASCII, max 60 chars, never empty). */
export function slugify(text: string, fallback = "document"): string {
  const s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || fallback;
}

/** Pick a human-meaningful base name from the render inputs. */
export function pickBaseName(input: {
  filename?: string;
  title?: string;
  markdown?: string;
  template?: string;
  data?: Record<string, unknown>;
}): string {
  if (input.filename?.trim()) return slugify(input.filename);
  if (input.title?.trim()) return slugify(input.title);
  if (input.markdown) {
    const m = input.markdown.match(/^\s*#\s+(.+?)\s*$/m);
    if (m) return slugify(m[1]);
  }
  if (input.template && input.data) {
    const d = input.data;
    const candidates = [d.title, d.number, d.recipient].filter((v): v is string => typeof v === "string" && v.trim() !== "");
    if (candidates.length) return slugify(`${input.template}-${candidates[0]}`);
    return slugify(input.template);
  }
  return "document";
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Write `bytes` to a PDF file and return its absolute path.
 *  - No `requested` path: a unique `<base>.pdf`, `<base>-2.pdf`, ... under `outputDir`.
 *  - `requested` is an existing directory or ends with a path separator: unique file inside it.
 *  - Otherwise `requested` is the exact file (relative paths resolve against `outputDir`);
 *    `.pdf` is appended if missing and an existing file is overwritten.
 */
export async function writePdf(bytes: Uint8Array, outputDir: string, baseName: string, requested?: string): Promise<string> {
  let dir = outputDir;
  let exact: string | null = null;
  if (requested && requested.trim()) {
    const r = requested.trim();
    const abs = path.resolve(outputDir, r);
    if (/[\\/]$/.test(r) || (await isDirectory(abs))) {
      dir = abs;
    } else {
      exact = abs.toLowerCase().endsWith(".pdf") ? abs : `${abs}.pdf`;
      dir = path.dirname(exact);
    }
  }
  await fs.mkdir(dir, { recursive: true });
  if (exact) {
    await fs.writeFile(exact, bytes);
    return exact;
  }
  for (let i = 1; i <= 10_000; i++) {
    const candidate = path.join(dir, i === 1 ? `${baseName}.pdf` : `${baseName}-${i}.pdf`);
    try {
      await fs.writeFile(candidate, bytes, { flag: "wx" }); // atomic create-or-fail
      return candidate;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  throw new Error(`Could not find a free filename for ${baseName}.pdf in ${dir}`);
}
