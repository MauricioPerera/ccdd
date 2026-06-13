---
id: poc-login-001
objetivo: "Iniciar sesión en the-internet.herokuapp.com con las credenciales de prueba"
executor: { runtime: pi, model: "kimi-k2.6:cloud", tools: [browser], isolation: none }
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
      - "la URL es https://the-internet.herokuapp.com/secure"   # gate: url
      - "el DOM muestra 'You logged into a secure area!'"        # gate: dom (#flash)
audit: { record: ./audit/poc-login-001.json }
---

## Historia
Como usuario quiero autenticarme en el sitio para acceder al área segura.

## Contexto para el ejecutor
- URL: https://the-internet.herokuapp.com/login
- Usuario: tomsmith
- Password: SuperSecretPassword!

## Criterios blandos
(ninguno en este PoC — todo es determinista)
