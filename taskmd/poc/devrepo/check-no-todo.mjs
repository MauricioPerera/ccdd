// DoD: invariante transversal — el código no debe dejar marcadores TODO.
// Escanea los .mjs FUENTE del directorio actual (excluye *.test.mjs y este propio
// script), no un archivo hardcodeado: así el gate verifica lo que la DoD promete,
// sea cual sea el archivo que el ejecutor implementó.
import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const self = basename(new URL(import.meta.url).pathname);
const sources = readdirSync(".").filter(
  (f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs") && f !== self
);

const withTodo = sources.filter((f) => readFileSync(f, "utf8").includes("TODO"));
if (withTodo.length) {
  console.error(`TODO encontrado en: ${withTodo.join(", ")}`);
  process.exit(1);
}
process.exit(0);
