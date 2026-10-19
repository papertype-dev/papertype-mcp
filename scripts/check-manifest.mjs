// Validate server.json against the MCP registry schema it declares (needs network for the schema).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));
const res = await fetch(manifest.$schema);
if (!res.ok) throw new Error(`could not fetch schema ${manifest.$schema}: HTTP ${res.status}`);
const schema = await res.json();
const Ajv = schema.$schema?.includes("2020-12") ? require("ajv/dist/2020").default : require("ajv").default;
const ajv = new Ajv({ strict: false, allErrors: true });
try { require("ajv-formats")(ajv); } catch {}
const ok = ajv.validate(schema, manifest);
if (!ok) { console.error("server.json INVALID:", JSON.stringify(ajv.errors, null, 2)); process.exit(1); }
console.log(`server.json valid against ${manifest.$schema}`);
