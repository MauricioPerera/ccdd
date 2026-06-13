// Ejecutor MOCK determinista para probar el lazo: intento 1 = no-op (FAIL),
// intento >=2 = realiza el login por CDP (PASS). Simula "ejecutor que corrige
// con el feedback".
const attempt = Number(process.argv[2] || "1");
const model = process.argv[3] || "";
// Dos demos con el mismo mock:
//  - escalera (modelos "cheap"/"capable"): cheap SIEMPRE falla, capable SIEMPRE acierta.
//  - reintento (otro modelo): falla intento 1, acierta intento 2.
const isLadder = model.includes("cheap") || model.includes("capable");
const ladderFail = isLadder && model.includes("cheap");
const CDP = "http://localhost:9222";
const page = (await (await fetch(`${CDP}/json`)).json()).find((t) => t.type === "page" && t.url.includes("the-internet"));
if (!page) { console.log("  mock: sin página"); process.exit(0); }

function evalp(wsUrl, expression) {
  return new Promise((res) => {
    const ws = new WebSocket(wsUrl);
    const to = setTimeout(() => { try { ws.close(); } catch {} res(null); }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) { clearTimeout(to); try { ws.close(); } catch {} res(m.result?.result?.value); } };
    ws.onerror = () => { clearTimeout(to); res(null); };
  });
}

if (ladderFail || (!isLadder && (attempt < 2 || process.env.MOCK_ALWAYS_FAIL))) {
  // no-op: asegura estado /login (sin loguear)
  await evalp(page.webSocketDebuggerUrl, `location.href='https://the-internet.herokuapp.com/login'; 'noop'`);
  await new Promise((r) => setTimeout(r, 1500));
  console.log("  mock: no-op (deja /login)");
} else {
  await evalp(page.webSocketDebuggerUrl, `
    document.querySelector('#username').value='tomsmith';
    document.querySelector('#password').value='SuperSecretPassword!';
    document.querySelector('button[type="submit"]').click(); 'login'`);
  await new Promise((r) => setTimeout(r, 2500));
  console.log("  mock: login realizado");
}
