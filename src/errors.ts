/**
 * Error raised for every failed PaperType API call. `status` is the HTTP status
 * (0 when the request never produced a response) and `detail` is the server's
 * own message, kept verbatim so the model sees exactly what the server said.
 */
export class PaperTypeError extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(message: string, status: number, detail: unknown = undefined) {
    super(message);
    this.name = "PaperTypeError";
    this.status = status;
    this.detail = detail;
  }
}

/** Flatten a FastAPI `detail` (string, or list of validation errors) to one line. */
export function detailToText(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        const loc = Array.isArray(rec.loc)
          ? rec.loc.filter((x) => x !== "body").map(String).join(".")
          : "";
        const msg = typeof rec.msg === "string" ? rec.msg : JSON.stringify(item);
        return loc ? `${loc}: ${msg}` : msg;
      }
      return String(item);
    });
    return parts.filter(Boolean).join("; ") || fallback;
  }
  if (detail === undefined || detail === null) return fallback;
  return typeof detail === "object" ? JSON.stringify(detail) : String(detail);
}

/** Build a clear, actionable message for a non-2xx response. */
export function messageForStatus(status: number, detail: unknown, baseUrl: string): string {
  const text = detailToText(detail, `HTTP ${status}`);
  switch (status) {
    case 401:
      return `PaperType rejected the API key (HTTP 401): ${text} Check PAPERTYPE_API_KEY; keys start with dp_ and are issued at ${baseUrl}/signup.`;
    case 400:
      return `PaperType rejected the request (HTTP 400): ${text}`;
    case 413:
      return `Input too large (HTTP 413): ${text} Shorten the document or split it into several renders (the limit is 2 MB of source).`;
    case 422:
      return `PaperType could not render the document (HTTP 422): ${text}`;
    case 429:
      return `Monthly quota reached (HTTP 429): ${text}`;
    case 402:
      return `Payment required (HTTP 402): ${text}`;
    default:
      return `PaperType API error (HTTP ${status}): ${text}`;
  }
}
