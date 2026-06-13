---
id: poc-ladder-001
objetivo: "Iniciar sesión en the-internet.herokuapp.com con las credenciales de prueba"
executor:
  runtime: pi
  models: ["kimi-cheap:cloud", "kimi-capable:cloud"]   # escalera: barato → capaz
  tools: [browser]
  isolation: none
browser: { start_url: "https://the-internet.herokuapp.com/login" }
dod: ./DOD.web.md
limits: { timeout_s: 120, max_retries: 1 }
acceptance:
  - scenario: "login exitoso"
    given:
      - "un navegador en la página de login https://the-internet.herokuapp.com/login"
    when:
      - "el agente inicia sesión con usuario tomsmith y contraseña SuperSecretPassword!"
    then:
      - "la URL es https://the-internet.herokuapp.com/secure"
      - "el DOM muestra 'You logged into a secure area!'"
audit: { record: ./audit/poc-ladder-001.json }
---

## Historia
Como usuario quiero autenticarme; si el modelo barato no converge, se escala a uno más capaz.
