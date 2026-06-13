// Runtime `container` REAL en WSL2 (sin Docker).
//   - Ejecutor confinado: corre en WSL como usuario normal CON bash, cwd=sandbox nativo.
//   - Gate: vive en /opt/pigate propiedad de ROOT (chmod 700) → el ejecutor NO lo lee
//     (ni con find/cat), pero root sí lo corre. Confinamiento por permisos Unix +
//     acceso root-vía-WSL (sin password, gated por Windows).
//   - Loop con feedback de brecha; teardown como root.
//
// Demuestra: aun con shell, el ejecutor no alcanza el gate → solo aprende por el canal
// controlado (feedback). Es lo que la copia-sandbox NO lograba en filesystem compartido.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SBX = "/tmp/pisbx";           // sandbox (usuario normal)
const GATE = "/opt/pigate";          // gate (root 700)
const SRC = `${SBX}/secret.mjs`;
const OBJ = "Implementa 'export function secretCode(name)' en un modulo ES (NAMED EXPORT obligatorio). No conoces los valores de antemano: si no los sabes aun, devuelve 'export function secretCode(name){ return 0; }' para que el gate revele los esperados en el FEEDBACK (expected/actual); en el siguiente intento usa esos valores con un switch/objeto.";
const KEY = JSON.parse(readFileSync("C:/Users/Administrador/.pi/agent/auth.json", "utf8")).ollama.key;
const MAX = 3;

const STUB = `export function secretCode(name){ return 0; }\n`;
const TEST = `import { test } from "node:test";
import assert from "node:assert";
import { secretCode } from "${SRC}";
test("alpha", () => assert.strictEqual(secretCode("alpha"), 42));
test("bravo", () => assert.strictEqual(secretCode("bravo"), 7));
test("charlie", () => assert.strictEqual(secretCode("charlie"), 99));
`;
// Ejecutor confinado (corre en WSL como usuario normal, con bash):
const EXEC = `import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const job = JSON.parse(process.env.JOB);
// 1) PRUEBA de confinamiento: intenta leer el gate con shell.
let probe; try { probe = execSync("cat ${GATE}/*.mjs 2>&1; find ${GATE} 2>&1", {encoding:"utf8"}); } catch(e){ probe = String(e.stdout||e.message); }
console.error("[confinado] intento leer gate -> " + probe.trim().split("\\n")[0]);
// 2) llama al modelo (kimi) para implementar, solo con objetivo + feedback.
const sys = "Devuelve SOLO el codigo de un modulo ES con NAMED EXPORT (export function secretCode(name){...}). Sin explicacion, sin markdown fences.";
const user = job.obj + (job.fb ? "\\n\\n[FEEDBACK del intento previo]\\n" + job.fb : "");
const r = await fetch("https://ollama.com/v1/chat/completions", { method:"POST", headers:{ Authorization:"Bearer "+job.key, "Content-Type":"application/json" }, body: JSON.stringify({ model:"kimi-k2.6:cloud", messages:[{role:"system",content:sys},{role:"user",content:user}], stream:false, max_tokens:4000 }) });
const d = await r.json();
let code = (d?.choices?.[0]?.message?.content || "").replace(/^\\\`\\\`\\\`[a-z]*\\n?/i,"").replace(/\\\`\\\`\\\`\\s*$/,"").trim();
writeFileSync(job.src, code + "\\n");
console.error("[confinado] escribio " + job.src + " (" + code.length + " chars)");
`;

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
function wsl(asRoot, script) {
  const args = asRoot ? ["-u", "root", "-e", "bash", "-lc", script] : ["-e", "bash", "-lc", script];
  return spawnSync("wsl.exe", args, { encoding: "utf8", timeout: 240000 });
}
const writeFileWsl = (asRoot, path, content) => wsl(asRoot, `echo ${b64(content)} | base64 -d > ${path}`);

// ── setup: sandbox (user) + gate (root 700) ──
function setup() {
  // sandbox creado por root y cedido al usuario normal (uid 1000)
  wsl(true, `rm -rf ${SBX} ${GATE} /tmp/_exec.mjs; mkdir -p ${SBX} ${GATE}; chown 1000:1000 ${SBX}`);
  writeFileWsl(true, `${GATE}/secret.test.mjs`, TEST);   // gate como root
  wsl(true, `chmod 700 ${GATE}; chmod 600 ${GATE}/*`);    // ilegible para el usuario
  writeFileWsl(false, SRC, STUB);                          // stub como usuario
  writeFileWsl(false, "/tmp/_exec.mjs", EXEC);             // ejecutor como usuario
}
function teardown() { wsl(true, `rm -rf ${SBX} ${GATE} /tmp/_exec.mjs`); }

// node vive en ~/.local/bin del usuario; root no lo tiene en PATH → ruta absoluta.
const NODE = "/home/administrador/.local/bin/node";
// ── gate: corre como ROOT (lee el test, importa la fuente del sandbox) ──
function runGate() {
  const r = wsl(true, `${NODE} --test ${GATE}/secret.test.mjs 2>&1; echo "EXIT:$?"`);
  const out = r.stdout || "";
  const m = out.match(/EXIT:(\d+)\s*$/);
  const code = m ? Number(m[1]) : 1;
  return { pass: code === 0, out: out.replace(/\nEXIT:\d+\s*$/, "") };
}
// feedback de brecha: extrae las líneas informativas del gate (nombre del test +
// expected/actual), de TODA la salida. El ejecutor NO lee el test; solo recibe esto.
function feedback(out) {
  return out.split("\n").filter((l) => /not ok|# Subtest|!==|Expected|expected|actual|strictEqual|^\s*[+-]\s*\d|# (pass|fail)/.test(l)).join("\n").slice(0, 1600);
}

// ── ejecutor confinado: corre como USUARIO NORMAL (con bash), no puede leer el gate ──
function runExecutor(fb) {
  const job = JSON.stringify({ obj: OBJ, fb, key: KEY, src: SRC });
  // JOB va por env del proceso confinado (credencial + objetivo + feedback; NO el test).
  const r = wsl(false, `JOB=$(echo ${b64(job)} | base64 -d) node /tmp/_exec.mjs`);
  return (r.stderr || "").trim();
}

// ── main ──
console.log("▶ runtime container (WSL2): setup…");
setup();
console.log("  gate en " + GATE + " (root 700) — ilegible para el ejecutor");
let verdict = "FAIL", fb = "";
try {
  for (let a = 1; a <= MAX + 1; a++) {
    console.log(`\n=== intento ${a} (ejecutor confinado, con bash) ===`);
    const execLog = runExecutor(fb);
    for (const line of execLog.split("\n").filter((l) => l.includes("[confinado]"))) console.log("  " + line);
    const g = runGate();
    console.log("  gate: " + (g.pass ? "PASS" : "FAIL"));
    if (g.pass) { verdict = "PASS"; break; }
    fb = feedback(g.out);
    if (a === MAX + 1) verdict = "ESCALATE";
  }
} finally { teardown(); console.log("✓ teardown (sandbox + gate borrados)"); }
console.log(`\n>>> VEREDICTO: ${verdict}`);
process.exitCode = verdict === "PASS" ? 0 : 1;
