// Gate-runner GENÉRICO — el motor del contrato.
// Lee un TASK.md + su DOD.md, resuelve cada step (AC y DoD) contra el catálogo de
// plantillas cerrado, y ejecuta los gates tipados contra la realidad.
//   technical_done = (todos los AC en PASS) AND (toda la DoD en PASS)
//
// Modos:
//   node run-task.mjs <TASK.md>           → ejecuta gates, veredicto (exit 0/1)
//   node run-task.mjs <TASK.md> --lint    → contract-lint (cerrado, sin browser): campos,
//                                            dod existe, todo step resuelve. exit 0 ok / 2 error
//   node run-task.mjs <TASK.md> --dry     → como lint pero solo muestra gates resueltos
//   [--cdp http://localhost:9222]

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve as rpath } from "node:path";
import yaml from "js-yaml";
import { CATALOG } from "./catalog.mjs";

const args = process.argv.slice(2);
const taskPath = args.find((a) => !a.startsWith("--"));
const lint = args.includes("--lint");
const dry = args.includes("--dry");
const cdpFlag = args[args.indexOf("--cdp") + 1];
const CDP = (args.includes("--cdp") && cdpFlag) || process.env.CDP_URL || "http://localhost:9222";
if (!taskPath) { console.error("uso: run-task.mjs <TASK.md> [--lint|--dry] [--cdp url]"); process.exit(2); }

// ── parse TASK front-matter ──
const fmm = readFileSync(taskPath, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!fmm) { console.error("TASK.md sin front-matter YAML"); process.exit(2); }
const meta = yaml.load(fmm[1]);

// ── contract-lint: campos requeridos + carga de DoD ──
const problems = [];
for (const f of ["id", "objetivo", "executor", "acceptance", "audit", "dod"]) if (!(f in meta)) problems.push(`falta campo requerido '${f}'`);

// ── integridad del gate / aislamiento del ejecutor ──
// Si el ejecutor puede ALCANZAR el gate (leer los tests/archivos de verificación),
// la verificación es gameable. El contrato DEBE declarar su postura de aislamiento,
// y lint caza las combinaciones incoherentes/inseguras.
const READERS = ["read", "bash", "edit"]; // tools que permiten leer el filesystem
const iso = meta.executor?.isolation;
const tools = meta.executor?.tools;
const canRead = Array.isArray(tools) && tools.some((t) => READERS.includes(t));
const hasShell = Array.isArray(tools) && tools.includes("bash");
if (!iso) problems.push("falta 'executor.isolation' (none | tool-restricted | sandbox | container)");
else if (!["none", "tool-restricted", "sandbox", "container"].includes(iso)) problems.push(`executor.isolation inválido: '${iso}'`);
else if (iso === "tool-restricted") {
  if (!Array.isArray(tools) || canRead) problems.push("isolation 'tool-restricted' exige executor.tools SIN acceso de lectura (p.ej. [write]); si necesita read/edit/bash, declara 'sandbox' (sin shell) o 'container'");
}
else if (iso === "sandbox") {
  // Empírico: en filesystem compartido, un agente con shell lee el material del gate
  // (test/audit/env/fuente) por más held-out que esté. La copia-sandbox NO confina shell.
  if (hasShell) problems.push("'sandbox' (copia) NO confina un ejecutor con shell en filesystem compartido — el agente alcanza test/audit/env/fuente vía bash. Quita 'bash' o declara 'container' (namespace separado)");
}
else if (iso === "none") {
  if (meta.workdir) problems.push("'none' con gate basado en archivos (workdir): el ejecutor tiene los tests a mano → verificación GAMEABLE. Usa 'sandbox' (sin shell), 'tool-restricted' o 'container'");
}
// 'container' (namespace de FS separado: contenedor/VM/WSL sin mount compartido) se
// acepta: declara confinamiento real, no verificable por lint (igual que la firma del sandbox).

let dodSteps = [];
if (meta.dod) {
  const dodPath = rpath(dirname(taskPath), meta.dod);
  if (!existsSync(dodPath)) problems.push(`dod no existe: ${meta.dod}`);
  else {
    try { dodSteps = yaml.load(readFileSync(dodPath, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]).gates ?? []; }
    catch (e) { problems.push(`dod ilegible o sin front-matter: ${e.message}`); }
  }
}

// ── steps ──
const acSteps = [];
for (const sc of meta.acceptance ?? []) for (const t of sc.then ?? []) acSteps.push(t);

// ── matcher (plantilla cerrada → matcher generado) ──
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function compile(t) {
  const names = []; let p = "", last = 0, m; const re = /\{(\w+)\}/g;
  while ((m = re.exec(t.step))) { p += esc(t.step.slice(last, m.index)) + "(.+?)"; names.push(m[1]); last = m.index + m[0].length; }
  p += esc(t.step.slice(last));
  return { ...t, regex: new RegExp("^" + p + "$"), names };
}
const compiled = CATALOG.map(compile);
function subst(o, slots) {
  if (typeof o === "string") return o.replace(/\{(\w+)\}/g, (_, k) => (k in slots ? slots[k] : `{${k}}`));
  if (Array.isArray(o)) return o.map((x) => subst(x, slots));
  if (o && typeof o === "object") { const r = {}; for (const k in o) r[k] = subst(o[k], slots); return r; }
  return o;
}
function resolve(step) {
  for (const c of compiled) { const m = step.match(c.regex); if (m) { const slots = {}; c.names.forEach((n, i) => (slots[n] = m[i + 1])); return { step, gate: subst(c.gate, slots) }; } }
  return { step, gate: null };
}
const all = [
  ...acSteps.map((s) => ({ kind: "AC", ...resolve(s) })),
  ...dodSteps.map((s) => ({ kind: "DoD", ...resolve(s) })),
];
for (const r of all) if (!r.gate) problems.push(`step sin plantilla (${r.kind}): "${r.step}"`);

// ── modo lint/dry ──
if (lint || dry) {
  const out = { id: meta.id, mode: lint ? "lint" : "dry", gates: all.filter((r) => r.gate).map((r) => ({ kind: r.kind, step: r.step, ...r.gate })), problems };
  console.log(JSON.stringify(out, null, 2));
  process.exit(problems.length ? 2 : 0);
}
// ejecución: si el contrato no pasa el lint, NO se corre.
if (problems.length) {
  console.log(JSON.stringify({ id: meta.id, verdict: "ERROR", reason: "contract-lint falló", problems }, null, 2));
  process.exit(2);
}

// ── CDP ──
async function pages() { return (await (await fetch(`${CDP}/json`)).json()).filter((t) => t.type === "page"); }
function cdpEval(wsUrl, expression) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl);
    const to = setTimeout(() => { try { ws.close(); } catch {} rej(new Error("cdp timeout")); }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) { clearTimeout(to); try { ws.close(); } catch {} res(m.result?.result?.value); } };
    ws.onerror = () => { clearTimeout(to); rej(new Error("ws error")); };
  });
}
const httpPages = async () => (await pages()).filter((p) => p.url.startsWith("http"));

// ── ejecutores de gates ──
async function runUrl(g) {
  const urls = (await httpPages()).map((p) => p.url);
  return { expected: `página en ${g.expected}`, observed: urls, pass: urls.some((u) => u === g.expected || u === g.expected + "/") };
}
async function runDom(g) {
  const ps = await httpPages(); const tgt = ps[ps.length - 1] || ps[0];
  if (!tgt) return { expected: `contiene "${g.contains}"`, observed: "(sin página)", pass: false };
  let txt = ""; try { txt = String((await cdpEval(tgt.webSocketDebuggerUrl, "document.body.innerText")) || ""); } catch (e) { return { expected: `contiene "${g.contains}"`, observed: `ERROR:${e.message}`, pass: false }; }
  return { expected: `contiene "${g.contains}"`, observed: txt.includes(g.contains) ? `…${g.contains}…` : txt.replace(/\s+/g, " ").slice(0, 100), pass: txt.includes(g.contains) };
}
async function runDomAbsent(g) {
  const ps = await httpPages(); const tgt = ps[ps.length - 1] || ps[0];
  if (!tgt) return { expected: "la página no es un estado de error", observed: "(sin página)", pass: false };
  let txt = ""; try { txt = String((await cdpEval(tgt.webSocketDebuggerUrl, "document.body.innerText")) || ""); } catch (e) { return { expected: "sin error", observed: `ERROR:${e.message}`, pass: false }; }
  const hit = g.markers.find((m) => txt.includes(m));
  return { expected: "la página no es un estado de error", observed: hit ? `encontrado: ${hit}` : "sin marcadores de error", pass: !hit };
}
async function runUrlScheme(g) {
  const urls = (await httpPages()).map((p) => p.url);
  return { expected: `esquema ${g.scheme}`, observed: urls, pass: urls.length > 0 && urls.every((u) => u.startsWith(g.scheme + ":")) };
}
async function runHttp(g) {
  try { const r = await fetch(g.url); const j = await r.json().catch(() => ({})); const v = g.jsonpath.split(".").reduce((o, k) => (o == null ? o : o[k]), j);
    return { expected: `${g.jsonpath}=${g.equals}`, observed: `status=${r.status} ${g.jsonpath}=${JSON.stringify(v)}`, pass: String(v) === String(g.equals) }; }
  catch (e) { return { expected: `${g.jsonpath}=${g.equals}`, observed: `ERROR:${e.message}`, pass: false }; }
}
// dev: corre un comando en el workdir; --workdir lo sobrescribe (sandbox).
const wdFlag = args.includes("--workdir") ? args[args.indexOf("--workdir") + 1] : null;
const WORKDIR = wdFlag ? rpath(wdFlag) : (meta.workdir ? rpath(dirname(taskPath), meta.workdir) : dirname(taskPath));
async function runExit(g) {
  const r = spawnSync(g.cmd, { shell: true, cwd: WORKDIR, encoding: "utf8", timeout: 120000 });
  const out = ((r.stdout || "") + (r.stderr || "")).replace(/\s+$/g, "");
  return { expected: `'${g.cmd}' → exit 0`, observed: `code=${r.status}\n${out.slice(-2000)}`, pass: r.status === 0 };
}
const EXEC = { url: runUrl, dom: runDom, "dom-absent": runDomAbsent, "url-scheme": runUrlScheme, http: runHttp, exit: runExit };

// ── run ──
const results = [];
for (const r of all) {
  const exec = EXEC[r.gate.type];
  // Un gate que LANZA (p.ej. CDP caído, fetch rechazado) es FAIL observable, no un
  // crash del runner: el veredicto tiene que salir siempre, con la brecha registrada.
  let res;
  try {
    res = exec ? await exec(r.gate) : { expected: "—", observed: `gate desconocido: ${r.gate.type}`, pass: false };
  } catch (e) {
    res = { expected: "—", observed: `ERROR ejecutando gate '${r.gate.type}': ${e.message}`, pass: false };
  }
  results.push({ kind: r.kind, step: r.step, type: r.gate.type, ...res });
}
const acPass = results.filter((g) => g.kind === "AC").every((g) => g.pass);
const dodPass = results.filter((g) => g.kind === "DoD").every((g) => g.pass);
const technical_done = acPass && dodPass;
console.log(JSON.stringify({ id: meta.id, verdict: technical_done ? "PASS" : "FAIL", technical_done, ac_pass: acPass, dod_pass: dodPass, gates: results }, null, 2));
process.exitCode = technical_done ? 0 : 1;
