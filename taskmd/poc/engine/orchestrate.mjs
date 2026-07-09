// Lazo de orquestación + CICLO DE VIDA del browser — un solo comando.
//   contract-lint → levantar Chrome + conectar chrome-devtools-mcp → delegar al
//   ejecutor barato → motor de gates (AC ∧ DoD) → feedback de brecha + reintento →
//   teardown garantizado (try/finally): restaura mcp.json, mata Chrome, limpia.
//
// Uso: node orchestrate.mjs <TASK.md> [--executor pi|mock] [--max N]
// El veredicto SIEMPRE lo da el motor (run-task.mjs), independiente del ejecutor.

import { readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, cpSync, mkdirSync, readdirSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import yaml from "js-yaml";

const here = import.meta.dirname;
const args = process.argv.slice(2);
const taskPath = resolve(args.find((a) => !a.startsWith("--")));
const executorMode = args[args.indexOf("--executor") + 1] || "pi";
// Front-matter tolerante a CRLF (checkout Windows) y sin desreferenciar null:
// un TASK.md sin front-matter debe abortar con mensaje, no crashear con TypeError.
const fmMatch = readFileSync(taskPath, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!fmMatch) { console.error(`✗ ${taskPath}: sin front-matter YAML (--- ... ---)`); process.exit(2); }
const meta = yaml.load(fmMatch[1]);
const objetivo = meta.objetivo;
const maxRetries = args.includes("--max") ? Number(args[args.indexOf("--max") + 1]) : (meta.limits?.max_retries ?? 1);
const startUrl = meta.browser?.start_url;

// Rutas del entorno (configurables; los defaults son los de la máquina de desarrollo
// original — parametrizados vía env para que el PoC corra en otra máquina sin editar código).
const PI_CLI = process.env.PI_CLI || "C:\\Users\\Administrador\\AppData\\Roaming\\npm\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\cli.js";
const CHROME = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const MCP = process.env.PI_MCP_JSON || "C:\\Users\\Administrador\\.pi\\agent\\mcp.json";
const MCP_BAK = resolve(here, "_mcp.bak.json");
const PROFILE = resolve(here, "_chrome_run");
// 'powershell.exe' (no 'powershell') — spawnSync no añade .exe ni busca PATHEXT.
const ps = (script) => spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8" });

// ── ciclo de vida del browser ──
function setupMcp() {
  // backup + reescribe mcp.json para que chrome-devtools-mcp se conecte a NUESTRO Chrome.
  copyFileSync(MCP, MCP_BAK);
  const cfg = JSON.parse(readFileSync(MCP, "utf8"));
  cfg.mcpServers["chrome-devtools"] = { command: "npx", args: ["-y", "chrome-devtools-mcp@latest", "--browserUrl", "http://localhost:9222", "--no-usage-statistics"], transport: "stdio", lifecycle: "eager" };
  if (cfg.mcpServers.n8n) cfg.mcpServers.n8n.lifecycle = "lazy";
  writeFileSync(MCP, JSON.stringify(cfg, null, 2));
}
function restoreMcp() { if (existsSync(MCP_BAK)) { copyFileSync(MCP_BAK, MCP); rmSync(MCP_BAK, { force: true }); } }
function launchChrome(url) {
  rmSync(PROFILE, { recursive: true, force: true });
  const c = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9222", "--remote-allow-origins=*", `--user-data-dir=${PROFILE}`, "--no-first-run", "--no-default-browser-check", url], { detached: true, stdio: "ignore" });
  c.unref();
}
async function waitCDP(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch("http://localhost:9222/json/version"); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}
function killChrome() {
  // Doble red: por perfil único (no toca el Chrome del usuario) + por dueño del puerto.
  ps(`
    Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*_chrome_run*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }
    $c=Get-NetTCPConnection -LocalPort 9222 -State Listen -EA SilentlyContinue
    foreach($x in $c){ $p=Get-Process -Id $x.OwningProcess -EA SilentlyContinue; if($p.ProcessName -eq 'chrome'){ Stop-Process -Id $x.OwningProcess -Force -EA SilentlyContinue } }
  `);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}

// ── sandbox: copia aislada de la fuente, SIN los tests ──
const SANDBOX = resolve(here, "_sandbox");
const isSandbox = meta.executor?.isolation === "sandbox" && !!meta.workdir;
const gateDir = meta.gate_tests ? resolve(dirname(taskPath), meta.gate_tests) : null;
function setupSandbox() {
  rmSync(SANDBOX, { recursive: true, force: true });
  mkdirSync(SANDBOX, { recursive: true });
  cpSync(resolve(dirname(taskPath), meta.workdir), SANDBOX, { recursive: true });
}
function teardownSandbox() { rmSync(SANDBOX, { recursive: true, force: true }); }

// Gate-test EN MEMORIA (vía env, no como archivo del árbol). Materializado solo
// durante el gate. Es la postura no-Docker más fuerte: durante el turno del
// ejecutor el test no existe en disco en ningún lado → `find` no encuentra nada.
const GT_NAME = process.env.GATE_TEST_NAME || null;
const GT_CONTENT = process.env.GATE_TEST_B64 ? Buffer.from(process.env.GATE_TEST_B64, "base64").toString("utf8") : null;

// ── motor de gates ──
// En sandbox: materializa los tests SOLO durante la corrida del gate (ejecutor ya
// inactivo) y los borra después → el test nunca vive en el árbol del ejecutor.
function runEngine() {
  let injected = [];
  if (isSandbox) {
    if (GT_NAME && GT_CONTENT) { const dst = resolve(SANDBOX, GT_NAME); writeFileSync(dst, GT_CONTENT); injected.push(dst); }
    else if (gateDir) { for (const f of readdirSync(gateDir)) { const dst = resolve(SANDBOX, f); copyFileSync(resolve(gateDir, f), dst); injected.push(dst); } }
  }
  const wd = isSandbox ? ["--workdir", SANDBOX] : [];
  const r = spawnSync("node", ["run-task.mjs", taskPath, ...wd], { cwd: here, encoding: "utf8" });
  for (const p of injected) rmSync(p, { force: true });
  let json = null; try { json = JSON.parse(r.stdout); } catch {}
  return { json, pass: r.status === 0 };
}
function synthFeedback(gates) {
  const obs = gates.filter((g) => !g.pass).map((g) => `  - ${JSON.stringify(g.observed)}`).join("\n");
  return `El objetivo aún NO se cumplió: "${objetivo}".\nEstado actual observado:\n${obs}\nVuelve a intentar lograr el objetivo.`;
}
const obsFp = (gates) => JSON.stringify(gates.filter((g) => !g.pass).map((g) => g.observed));

const isDev = !!meta.workdir;
// El ejecutor NO debe heredar el material del gate por environment (el agente puede
// leer su propio env). Env filtrado para todo spawn del ejecutor.
function cleanEnv() { const e = { ...process.env }; delete e.GATE_TEST_B64; delete e.GATE_TEST_NAME; return e; }
function execute(feedback, attempt, model) {
  if (executorMode === "mock") { spawnSync("node", ["_mock-exec.mjs", String(attempt), model], { cwd: here, stdio: "inherit" }); return; }
  if (isDev) {
    // ejecutor de desarrollo: Pi con tools de edición, cwd=repo (o sandbox si aplica).
    const repo = isSandbox ? SANDBOX : resolve(dirname(taskPath), meta.workdir);
    const prompt = feedback
      ? `${objetivo}\n\n[FEEDBACK del intento previo]\n${feedback}`
      : `${objetivo}. Trabaja en el directorio actual: edita los archivos fuente necesarios. No edites los archivos .test.mjs.`;
    // Respeta el allowlist de tools del contrato (executor.tools) — acota la superficie del ejecutor.
    const toolFlags = Array.isArray(meta.executor?.tools) ? ["-t", meta.executor.tools.join(",")] : [];
    spawnSync("node", [PI_CLI, "--print", "--mode", "text", "--no-extensions", "--approve", ...toolFlags, "--provider", "ollama", "--model", model, "--thinking", "off", "--no-session", prompt], { cwd: repo, input: "", encoding: "utf8", timeout: 220000, windowsHide: true, env: cleanEnv() });
    return;
  }
  // ejecutor de browser
  const prompt = feedback
    ? `${objetivo}\n\n[FEEDBACK del intento previo]\n${feedback}`
    : `Logra este objetivo usando el navegador: ${objetivo}. Contexto: login en ${startUrl} con usuario tomsmith y contrasena SuperSecretPassword!.`;
  spawnSync("node", [PI_CLI, "--print", "--mode", "text", "-nbt", "--provider", "ollama", "--model", model, "--thinking", "off", "--no-session", prompt], { input: "", encoding: "utf8", timeout: 220000, windowsHide: true, env: cleanEnv() });
}

// ── main ──
async function main() {
  // 1) contract-lint previo (cerrado): si está malformado, no se ejecuta nada.
  const lintRes = spawnSync("node", ["run-task.mjs", taskPath, "--lint"], { cwd: here, encoding: "utf8" });
  if (lintRes.status !== 0) { console.log("✗ contract-lint FALLÓ — el contrato no se ejecuta:\n" + (lintRes.stdout || lintRes.stderr)); return 2; }
  console.log("✓ contract-lint OK");

  // 2) ciclo de vida del browser (solo si el contrato lo requiere)
  if (isSandbox) { setupSandbox(); console.log(`▶ sandbox listo (copia aislada de ${meta.workdir}, sin tests)`); }

  const needChrome = !!startUrl;
  const needMcp = needChrome && executorMode === "pi";
  if (needChrome) {
    if (needMcp) setupMcp();
    console.log(`▶ levantando Chrome en ${startUrl} …`);
    launchChrome(startUrl);
    if (!(await waitCDP())) { if (needMcp) restoreMcp(); killChrome(); console.log("✗ Chrome/CDP no levantó"); return 2; }
    console.log("✓ Chrome listo (CDP 9222)");
  }

  // Escalera de escalado (§10.1): lista ordenada de modelos. Cada peldaño corre hasta
  // no-progreso o agotar su budget; entonces SUBE al siguiente. Solo ESCALA a humano
  // cuando se agota la escalera. El feedback se acarrea entre peldaños.
  const ladder = meta.executor?.models?.length ? meta.executor.models : [meta.executor?.model || "kimi-k2.6:cloud"];
  const audit = { id: meta.id, objetivo, executor: executorMode, ladder, attempts: [] };
  let verdict = "FAIL", fb = null;
  try {
    outer:
    for (let li = 0; li < ladder.length; li++) {
      const model = ladder[li];
      let lastFp = null;
      if (ladder.length > 1) console.log(`\n── peldaño ${li + 1}/${ladder.length}: modelo ${model} ──`);
      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        console.log(`=== intento ${attempt} (modelo=${model}) ===`);
        execute(fb, attempt, model);
        const eng = runEngine();
        const rec = { rung: li + 1, model, attempt, engine_verdict: eng.json?.verdict, ac_pass: eng.json?.ac_pass, dod_pass: eng.json?.dod_pass };
        console.log(`  motor: ${eng.json?.verdict}`);
        if (eng.pass) { rec.feedback = null; audit.attempts.push(rec); verdict = "PASS"; break outer; }
        const fp = obsFp(eng.json.gates);
        if (fp === lastFp) { rec.note = "no-progreso"; audit.attempts.push(rec); console.log("  → no-progreso: subir de modelo"); break; }
        lastFp = fp;
        fb = synthFeedback(eng.json.gates);
        rec.feedback = fb;
        audit.attempts.push(rec);
        if (attempt === maxRetries + 1) console.log("  → budget del modelo agotado: subir de modelo");
      }
    }
    if (verdict !== "PASS") { verdict = "ESCALATE"; console.log("\n  → escalera agotada: escalar a humano"); }
  } finally {
    if (needMcp) restoreMcp();
    if (needChrome) { killChrome(); console.log("✓ teardown (mcp restaurado, Chrome cerrado)"); }
    if (isSandbox) { teardownSandbox(); console.log("✓ sandbox descartado"); }
  }

  audit.verdict = verdict;
  const auditPath = resolve(dirname(taskPath), (meta.audit?.record || "./audit/orchestration.json").replace(/\.json$/, ".orchestration.json"));
  writeFileSync(auditPath, JSON.stringify(audit, null, 2));
  console.log(`\n>>> VEREDICTO FINAL: ${verdict} (intentos: ${audit.attempts.length})`);
  console.log(`>>> audit: ${auditPath}`);
  return verdict === "PASS" ? 0 : 1;
}

main().then((code) => { process.exitCode = code; });
