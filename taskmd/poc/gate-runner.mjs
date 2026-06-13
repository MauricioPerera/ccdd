// PoC-0 gate-runner — corre los gates deterministas del TASK.login.md contra el
// MISMO Chrome que usó el ejecutor (CDP @ 9222), independiente de lo que diga Pi.
// Node puro: usa fetch global + WebSocket global (Node 22+). Sin dependencias.
//
// Gates:
//   url:   existe una página en https://the-internet.herokuapp.com/secure
//   flash: esa página muestra "You logged into a secure area!"
//
// Salida: JSON { verdict, technical_done, gates:[{id,expected,observed,pass}] }
// exit 0 = PASS, 1 = FAIL, 2 = ERROR (no evaluable).

const CDP = "http://localhost:9222"; // 'localhost' host header required by Chrome's anti-DNS-rebinding guard
const SECURE = "the-internet.herokuapp.com/secure";
const FLASH_TEXT = "You logged into a secure area!";

function cdpEval(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("cdp timeout")); }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 1) { clearTimeout(t); try { ws.close(); } catch {} resolve(msg.result?.result?.value); }
    };
    ws.onerror = () => { clearTimeout(t); reject(new Error("ws error")); };
  });
}

function fail(reason) {
  console.log(JSON.stringify({ verdict: "ERROR", reason }, null, 2));
  process.exit(2);
}

let targets;
try {
  targets = await (await fetch(`${CDP}/json`)).json();
} catch (e) {
  fail(`no se pudo consultar CDP en ${CDP}: ${e.message}`);
}

const pages = targets.filter((t) => t.type === "page");
const heroku = pages.filter((t) => t.url.includes("the-internet.herokuapp.com"));
const secure = pages.find((t) => t.url.includes(SECURE));

// Gate 1 — URL
const urlGate = {
  id: "url",
  expected: `página en ${SECURE}`,
  observed: heroku.map((t) => t.url),
  pass: !!secure,
};

// Gate 2 — DOM flash (sobre la página /secure si existe, si no la primera heroku)
let flashObserved = "(sin página objetivo)";
let flashPass = false;
const evalTarget = secure || heroku[0];
if (evalTarget) {
  try {
    const v = await cdpEval(evalTarget.webSocketDebuggerUrl, `(document.querySelector('#flash')||{}).innerText||''`);
    flashObserved = String(v || "").replace(/\s+/g, " ").trim().slice(0, 140);
    flashPass = flashObserved.includes(FLASH_TEXT);
  } catch (e) {
    flashObserved = `ERROR:${e.message}`;
  }
}
const flashGate = { id: "flash", expected: `contiene "${FLASH_TEXT}"`, observed: flashObserved, pass: flashPass };

const gates = [urlGate, flashGate];
const technical_done = gates.every((g) => g.pass);
console.log(JSON.stringify({ verdict: technical_done ? "PASS" : "FAIL", technical_done, gates }, null, 2));
process.exit(technical_done ? 0 : 1);
