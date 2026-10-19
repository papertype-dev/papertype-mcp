/**
 * Hosted templates served by POST /v1/pdf with `template` + `data`.
 * Field lists and samples are copied from the server's doc_templates/<name>/meta.json
 * and sample.json. Live reference: https://papertype.dev/templates/<name>
 */
export interface TemplateField {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface TemplateInfo {
  name: "invoice" | "certificate" | "report";
  title: string;
  description: string;
  orientation: "portrait" | "landscape";
  fields: TemplateField[];
  sample: Record<string, unknown>;
}

export const TEMPLATE_NAMES = ["invoice", "certificate", "report"] as const;

export const TEMPLATES: TemplateInfo[] = [
  {
    name: "invoice",
    title: "Invoice",
    description:
      "A clean, itemised invoice with your details, the client's details, line items, optional discount and tax, totals and payment instructions. Totals are computed on the server from quantity × unit price.",
    orientation: "portrait",
    fields: [
      { name: "number", type: "string", required: true, description: "Invoice number, e.g. INV-2026-014" },
      { name: "date", type: "string (YYYY-MM-DD)", required: true, description: "Issue date" },
      { name: "due_date", type: "string (YYYY-MM-DD)", required: false, description: "Payment due date" },
      { name: "currency", type: "string", required: false, description: "ISO code, default USD" },
      { name: "from", type: "object", required: true, description: "{name, address_lines[], email, tax_id} — you, the issuer" },
      { name: "to", type: "object", required: true, description: "{name, address_lines[], email, tax_id} — the client" },
      { name: "items", type: "array", required: true, description: "[{description, quantity, unit_price}]" },
      { name: "discount", type: "number", required: false, description: "Flat discount amount subtracted before tax" },
      { name: "tax_rate", type: "number", required: false, description: "Percent, e.g. 20 for 20% VAT" },
      { name: "tax_label", type: "string", required: false, description: "Label for the tax line, default 'Tax'" },
      { name: "notes", type: "string", required: false, description: "Free text under the totals (terms, thank-you)" },
      { name: "payment_instructions", type: "string", required: false, description: "Bank details or payment link text" },
      { name: "logo", type: "string (data:image/... URI)", required: false, description: "Your logo, inline as a data URI" },
      { name: "accent", type: "string (CSS color)", required: false, description: "Accent colour for headings, default #0b5c6b" },
    ],
    sample: {
      number: "INV-2026-014",
      date: "2026-10-18",
      due_date: "2026-11-17",
      currency: "USD",
      from: {
        name: "Northwind Studio LLC",
        address_lines: ["120 Market Street, Suite 4", "Portland, OR 97201"],
        email: "billing@example.com",
        tax_id: "EIN 12-3456789",
      },
      to: { name: "Acme Robotics Inc.", address_lines: ["500 Industrial Way", "Austin, TX 78701"], email: "ap@example.org" },
      items: [
        { description: "Brand identity design — logo, colour system, typography", quantity: 1, unit_price: 3200 },
        { description: "Website design (6 page templates)", quantity: 6, unit_price: 450 },
        { description: "Design review meetings", quantity: 3, unit_price: 150 },
      ],
      discount: 200,
      tax_rate: 8.25,
      tax_label: "Sales tax",
      notes: "Thank you for your business. Payment is due within 30 days.",
      payment_instructions:
        "Bank transfer: First Example Bank · Routing 000000000 · Account 123456789 · Reference INV-2026-014",
    },
  },
  {
    name: "certificate",
    title: "Certificate",
    description:
      "A landscape certificate of completion, achievement or attendance: recipient name, what it is for, issuer, date, signature line and an optional certificate ID for verification.",
    orientation: "landscape",
    fields: [
      { name: "title", type: "string", required: false, description: "Default 'Certificate of Completion'" },
      { name: "recipient", type: "string", required: true, description: "The person's name" },
      { name: "statement", type: "string", required: false, description: "Text before the achievement, default 'has successfully completed'" },
      { name: "achievement", type: "string", required: true, description: "Course, event or achievement name" },
      { name: "description", type: "string", required: false, description: "One sentence of detail (hours, level, dates)" },
      { name: "date", type: "string (YYYY-MM-DD)", required: true, description: "Date awarded" },
      { name: "issuer", type: "string", required: true, description: "Organisation issuing the certificate" },
      { name: "signer", type: "string", required: false, description: "Name on the signature line" },
      { name: "signer_title", type: "string", required: false, description: "Role of the signer" },
      { name: "certificate_id", type: "string", required: false, description: "Unique ID printed small for verification" },
      { name: "logo", type: "string (data:image/... URI)", required: false, description: "Issuer logo as a data URI" },
      { name: "accent", type: "string (CSS color)", required: false, description: "Border and heading colour, default #0b5c6b" },
    ],
    sample: {
      title: "Certificate of Completion",
      recipient: "Maya Okonkwo",
      statement: "has successfully completed",
      achievement: "Technical Writing for Engineers",
      description: "A 12-hour course covering structure, clarity and documentation tooling.",
      date: "2026-10-18",
      issuer: "Northwind Learning",
      signer: "Daniel Reyes",
      signer_title: "Programme Director",
      certificate_id: "NWL-2026-00417",
    },
  },
  {
    name: "report",
    title: "Report",
    description:
      "A structured report with cover page, optional key-figures strip, and sections written in Markdown (headings, lists, tables, code). Good for monthly client reports, audits and summaries generated from your data.",
    orientation: "portrait",
    fields: [
      { name: "title", type: "string", required: true, description: "Report title (cover page)" },
      { name: "subtitle", type: "string", required: false, description: "Cover subtitle, e.g. the period" },
      { name: "author", type: "string", required: false, description: "Prepared by" },
      { name: "client", type: "string", required: false, description: "Prepared for" },
      { name: "date", type: "string (YYYY-MM-DD)", required: false, description: "Report date" },
      { name: "summary", type: "string (Markdown)", required: false, description: "Executive summary shown first" },
      { name: "kpis", type: "array", required: false, description: "[{label, value, note}] shown as a strip of figures" },
      { name: "sections", type: "array", required: true, description: "[{heading, body}] — body is Markdown" },
      { name: "logo", type: "string (data:image/... URI)", required: false, description: "Logo on the cover" },
      { name: "accent", type: "string (CSS color)", required: false, description: "Heading colour, default #0b5c6b" },
    ],
    sample: {
      title: "Website Performance Report",
      subtitle: "September 2026",
      author: "Northwind Studio",
      client: "Acme Robotics Inc.",
      date: "2026-10-01",
      summary:
        "Organic traffic grew for the third month in a row while the checkout error rate fell after the September release. Two items need a decision this month: the image CDN migration and the search page redesign.",
      kpis: [
        { label: "Sessions", value: "48,210", note: "+12% vs Aug" },
        { label: "Conversion", value: "2.8%", note: "+0.3 pt" },
        { label: "Checkout errors", value: "0.4%", note: "−1.1 pt" },
        { label: "Median LCP", value: "1.9 s", note: "target 2.5 s" },
      ],
      sections: [
        {
          heading: "Traffic",
          body:
            "Sessions rose to **48,210**. The largest gains came from the documentation pages published in August.\n\n| Channel | Sessions | Change |\n|---|---|---|\n| Organic search | 29,400 | +18% |\n| Direct | 11,050 | +4% |\n| Referral | 7,760 | +9% |",
        },
        {
          heading: "Checkout reliability",
          body:
            "The September release fixed the address-validation timeout. Error rate fell from 1.5% to 0.4%.\n\n- Remaining errors are concentrated on one payment method.\n- A retry was added for the tax-calculation call.",
        },
        {
          heading: "Decisions needed",
          body:
            "1. **Image CDN migration** — estimated 0.3 s LCP improvement, two days of work.\n2. **Search page redesign** — prototype ready for review.",
        },
      ],
    },
  },
];

export function templateByName(name: string): TemplateInfo | undefined {
  return TEMPLATES.find((t) => t.name === name);
}
