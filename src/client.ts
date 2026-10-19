import { PaperTypeError, messageForStatus } from "./errors.js";
import { USER_AGENT } from "./version.js";

export interface RenderRequest {
  html?: string;
  markdown?: string;
  template?: string;
  data?: Record<string, unknown>;
  css?: string;
  theme?: string;
  page_size?: string;
  title?: string;
  author?: string;
  date?: string;
  cover?: boolean;
  toc?: boolean;
  page_numbers?: boolean;
  footer?: string;
  header?: string;
  filename?: string;
}

export interface RenderResult {
  pdf: Uint8Array;
  /** From X-Pages; null if the header was missing. */
  pages: number | null;
  /** From X-Quota-Used / X-Quota-Limit; null if missing. */
  quotaUsed: number | null;
  quotaLimit: number | null;
}

export interface Account {
  email: string;
  plan: string;
  quota: number;
  used_this_month: number;
  watermark: boolean;
}

export interface ClientOptions {
  apiKey: string;
  baseUrl: string;
  /** Injected for tests; defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Render timeout in ms (renders queue server-side, so allow a while). */
  renderTimeoutMs?: number;
  requestTimeoutMs?: number;
}

function headerInt(res: Response, name: string): number | null {
  const v = res.headers.get(name);
  if (v === null || v.trim() === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function readDetail(res: Response): Promise<unknown> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    return `HTTP ${res.status}`;
  }
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && "detail" in body) {
      return (body as { detail: unknown }).detail;
    }
    return body;
  } catch {
    return text.trim() || `HTTP ${res.status}`;
  }
}

/** Thin fetch-based client for POST /v1/pdf and GET /v1/me. */
export class PaperTypeClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof globalThis.fetch | undefined;
  private readonly renderTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private accountCache: Account | null = null;

  constructor(opts: ClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetch; // resolved per call so tests can stub globalThis.fetch
    this.renderTimeoutMs = opts.renderTimeoutMs ?? 180_000;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 30_000;
  }

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("User-Agent", USER_AGENT);
    headers.set("Accept", "application/pdf, application/json");
    let res: Response;
    try {
      const doFetch = this.fetchImpl ?? globalThis.fetch;
      res = await doFetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const e = err as Error & { cause?: { code?: string; message?: string } };
      const why = e.cause?.code ?? e.cause?.message ?? e.message ?? String(err);
      const timedOut = e.name === "TimeoutError" || e.name === "AbortError";
      throw new PaperTypeError(
        timedOut
          ? `Request to ${url} timed out after ${Math.round(timeoutMs / 1000)}s.`
          : `Could not reach PaperType at ${url}: ${why}. Check your network and PAPERTYPE_BASE_URL.`,
        0,
        why,
      );
    }
    if (!res.ok) {
      const detail = await readDetail(res);
      throw new PaperTypeError(messageForStatus(res.status, detail, this.baseUrl), res.status, detail);
    }
    return res;
  }

  async render(body: RenderRequest): Promise<RenderResult> {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) if (v !== undefined) payload[k] = v;
    const res = await this.request(
      "/v1/pdf",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      this.renderTimeoutMs,
    );
    const pdf = new Uint8Array(await res.arrayBuffer());
    if (pdf.length === 0) {
      throw new PaperTypeError("PaperType returned an empty response body instead of a PDF.", res.status);
    }
    return {
      pdf,
      pages: headerInt(res, "X-Pages"),
      quotaUsed: headerInt(res, "X-Quota-Used"),
      quotaLimit: headerInt(res, "X-Quota-Limit"),
    };
  }

  /** GET /v1/me. Not cached; see `account()` for the cached variant. */
  async me(): Promise<Account> {
    const res = await this.request("/v1/me", { method: "GET" }, this.requestTimeoutMs);
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new PaperTypeError("PaperType /v1/me returned a non-JSON body.", res.status);
    }
    if (!parsed || typeof parsed !== "object") {
      throw new PaperTypeError("PaperType /v1/me returned an unexpected body.", res.status, parsed);
    }
    return parsed as Account;
  }

  /** /v1/me cached for the lifetime of the process (only successful lookups are cached). */
  async account(): Promise<Account> {
    if (this.accountCache) return this.accountCache;
    const acct = await this.me();
    this.accountCache = acct;
    return acct;
  }
}
