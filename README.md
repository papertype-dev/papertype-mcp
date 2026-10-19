# papertype-mcp

An [MCP](https://modelcontextprotocol.io) server for [PaperType](https://papertype.dev), a hosted
PDF API. It lets Claude Desktop, Claude Code, Cursor and any other MCP client turn Markdown,
HTML or a filled-in template (invoice, certificate, report) into a PDF file on your disk.

The server runs locally over stdio, calls `https://papertype.dev/v1/pdf` with your API key, and
writes the PDF to a file. It returns the file path, page count and your remaining quota; it never
returns PDF bytes to the model.

Clients are open source (MIT); the rendering service is hosted and paid above the free tier.

- API reference: https://papertype.dev/docs
- Get an API key: https://papertype.dev/signup?ref=npm
- Python SDK and CLI: `pip install papertype`

## Requirements

- Node.js 20 or newer (uses the built-in `fetch`).
- A PaperType API key (`dp_...`) from https://papertype.dev/signup?ref=npm.

## Configuration

| Environment variable | Required | Default | Meaning |
|---|---|---|---|
| `PAPERTYPE_API_KEY` | yes | — | Your API key. The server refuses to start without it and prints where to get one. |
| `PAPERTYPE_BASE_URL` | no | `https://papertype.dev` | API origin; change only for self-hosted or test deployments. |
| `PAPERTYPE_OUTPUT_DIR` | no | `<OS temp dir>/papertype` (e.g. `/tmp/papertype`) | Where PDFs are written when a call gives no `output_path`. |

Files in the temp directory may be cleaned up by the OS; set `PAPERTYPE_OUTPUT_DIR` to a
persistent folder (for example `~/Documents/papertype`) if you want to keep them.

## Install

### Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows:
`%APPDATA%\Claude\`) and restart Claude Desktop:

```json
{
  "mcpServers": {
    "papertype": {
      "command": "npx",
      "args": ["-y", "papertype-mcp"],
      "env": {
        "PAPERTYPE_API_KEY": "dp_...",
        "PAPERTYPE_OUTPUT_DIR": "/Users/you/Documents/papertype"
      }
    }
  }
}
```

### Claude Code

```
claude mcp add papertype -e PAPERTYPE_API_KEY=dp_... -- npx -y papertype-mcp
```

Add `-e PAPERTYPE_OUTPUT_DIR=/path/to/folder` to choose where PDFs land. Check with `claude mcp list`.

### Cursor

Settings → MCP → Add new global MCP server, or create `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "papertype": {
      "command": "npx",
      "args": ["-y", "papertype-mcp"],
      "env": { "PAPERTYPE_API_KEY": "dp_..." }
    }
  }
}
```

### Any stdio MCP client

Run the command `npx -y papertype-mcp` (or install globally with `npm i -g papertype-mcp` and run
`papertype-mcp`) with `PAPERTYPE_API_KEY` in its environment. The server speaks MCP over
stdin/stdout; diagnostics go to stderr. `papertype-mcp --help` prints the options.

## Tools

### `render_pdf`

Render a document and save it as a PDF. Give exactly one source:

- `markdown` — GitHub-flavoured Markdown (tables, fenced code, footnotes, admonitions), or
- `html` — an HTML document or fragment, or
- `template` + `data` — one of `invoice`, `certificate`, `report` with a JSON object of fields.

Optional: `theme` (`clean` default, `report`, `minimal`, `letter`, `none`), `page_size` (`A4`
default, `Letter`, `Legal`, `A5`), `title`, `author`, `date`, `cover`, `toc` (Markdown only),
`page_numbers` (default true), `header`, `footer`, `css`, `filename`, and `output_path`.

`output_path` rules: omit it to get a unique file named after the title (or `filename`, or the
first Markdown heading) under `PAPERTYPE_OUTPUT_DIR`, never overwriting anything; pass an
existing directory (or a path ending in `/`) to save a uniquely named file in it; pass any other
path to write exactly that file (`.pdf` is appended if missing and an existing file is replaced).
Relative paths resolve against `PAPERTYPE_OUTPUT_DIR`.

Returns text like:

```
Saved PDF: /tmp/papertype/q3-report.pdf
Pages: 4
Quota this month: 12 of 50 documents used (free plan)
Note: free plan output carries a small papertype.dev mark.
```

Each successful call uses one document of the account's monthly quota.

### `list_templates`

Lists the three hosted templates with a description, every field (name, type, required) and a
complete sample `data` object. Local only; no quota used. Live pages:
https://papertype.dev/templates/invoice, `/templates/certificate`, `/templates/report`.

### `account`

Returns `GET /v1/me`: `email`, `plan`, `quota`, `used_this_month`, `watermark`. No quota used.

## Errors

API failures come back as tool errors (`isError: true`) that include the server's own message:

| HTTP | Meaning |
|---|---|
| 401 | Missing or invalid API key — check `PAPERTYPE_API_KEY`. |
| 400 | No `html`, `markdown` or `template` given. |
| 413 | Source larger than 2 MB. |
| 422 | Render or template error; the detail says which field or construct failed. |
| 429 | Monthly document quota reached; upgrade at https://papertype.dev/account. |

Network failures and timeouts are reported the same way, with the URL that was tried.

## Free plan

Free-plan PDFs carry a small papertype.dev mark in the footer; paid plans do not. The server
checks `/v1/me` once per process and appends a note to `render_pdf` results when the mark
applies, so the model (and you) are not surprised by it.

## Limits (server side)

2 MB of source and 300 pages per document. Renders are processed a couple at a time server-wide,
so a call can take several seconds under load; the client waits up to 3 minutes. Rendering is
CSS paged media (WeasyPrint); no JavaScript runs. See https://papertype.dev/docs.

## Development

```
npm install
npm run build     # tsc -> dist/
npm test          # vitest, fetch is mocked; no network or API key needed
PAPERTYPE_API_KEY=dp_... node dist/cli.js
```

Source layout: `src/cli.ts` (entry point, stdio transport), `src/server.ts` (tool definitions),
`src/client.ts` (fetch wrapper for `/v1/pdf` and `/v1/me`), `src/errors.ts` (status → message),
`src/output.ts` (file naming), `src/templates.ts` (template catalogue copied from the service's
`doc_templates/*/meta.json` and `sample.json`; keep it in sync when templates change).

## Publishing

- npm: bump `version` in `package.json` and `src/version.ts` (a test checks they match), then
  `npm publish`. `prepublishOnly` runs the build and tests.
- MCP Registry (https://registry.modelcontextprotocol.io): `server.json` in this folder follows
  the `2025-12-11` server.json schema and validates against it. Publishing additionally
  requires: (1) proving ownership of the `dev.papertype/*` namespace with the `mcp-publisher` CLI
  (`mcp-publisher login dns` or `login http` for papertype.dev; a GitHub-based namespace such as
  `io.github.<owner>/papertype-mcp` would use `login github` instead, and `name` plus
  `mcpName` below must then be changed to match), (2) the npm package containing an
  `"mcpName": "dev.papertype/papertype-mcp"` field in `package.json` so the registry can confirm
  the package belongs to that namespace, and (3) `mcp-publisher publish` run from this folder after
  the npm version is live. The registry's rules can change; run `mcp-publisher validate` (or the
  schema check in `npm run check:manifest`) before each publish rather than trusting this note.

## License

MIT. See `LICENSE`. "PaperType" refers to the hosted service at papertype.dev; this package is the
client, not the renderer.
