// DoD: invariante transversal — el código no debe dejar marcadores TODO.
import { readFileSync } from "node:fs";
process.exit(readFileSync("sum.mjs", "utf8").includes("TODO") ? 1 : 0);
