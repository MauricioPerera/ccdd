// Step library = catálogo de gates (decisión #1: catálogo de plantillas CERRADO).
// Cada entrada: una frase tipo Gherkin con {slots} tipados + la plantilla de gate
// que produce. El binding es por plantilla exacta (la frase, con los slots como
// huecos) — NO regex libre de autor. El runner genera el matcher desde la plantilla.
//
// Añadir un check = añadir una entrada aquí (revisada), igual que una regla de lint.

export const CATALOG = [
  {
    step: "la URL es {url}",
    slots: { url: "url" },
    gate: { type: "url", expected: "{url}" },
  },
  {
    step: "el DOM muestra '{text}'",
    slots: { text: "string" },
    gate: { type: "dom", contains: "{text}" },
  },
  {
    step: "el endpoint {url} responde {field}={value}",
    slots: { url: "url", field: "string", value: "string" },
    gate: { type: "http", url: "{url}", jsonpath: "{field}", equals: "{value}" },
  },

  // ── invariantes transversales (típicas de DoD) ──
  {
    step: "la página no muestra un estado de error",
    slots: {},
    gate: { type: "dom-absent", markers: ["Internal Server Error", "404 Not Found", "Application Error", "Something went wrong", "Service Unavailable"] },
  },
  {
    step: "la URL final usa https",
    slots: {},
    gate: { type: "url-scheme", scheme: "https" },
  },

  // ── dev: ejecutar un comando y checar su exit code (tests, build, lint, checks) ──
  {
    step: "el comando '{cmd}' tiene éxito",
    slots: { cmd: "string" },
    gate: { type: "exit", cmd: "{cmd}" },
  },
];
