# Contribuir a CCDD

CCDD es una **propuesta en Draft (v0.3)**. Las contribuciones, críticas y desacuerdos son
bienvenidos — especialmente los que rompen cosas.

## La mejor contribución: rompé el gate

CCDD es una metodología de *verificabilidad adversaria*. La forma más valiosa de ayudar es
aplicársela a sí misma: **encontrá un bypass del gate** que no hayamos cubierto.

El gate L2 (`ccdd_reference/ccdd.py`, comando `diff`) tiene 9 reglas (R1–R9) que deberían bloquear
cualquier cambio que **debilite la postura del contexto sin tocar el contenido firmado**. Si
encontrás una forma de debilitar un contrato que el `diff` deje pasar, abrí un issue con:

1. El contrato baseline y el contrato "head" (o un diff).
2. Por qué el cambio debilita la postura.
3. Por qué ninguna regla R1–R9 lo cazó.

Tres bypasses ya se encontraron así y se cerraron (R6 ampliada, R8, R9) — ver
[`ccdd_FINDINGS.md`](ccdd_FINDINGS.md) §3.

## Otras formas de contribuir

- **Criticar la especificación.** [`ccdd_spec_v0.3.md`](ccdd_spec_v0.3.md) es un Draft. Los niveles
  de conformidad, el modelo de gobernanza y el alcance están abiertos a discusión.
- **Validar en un dominio nuevo.** Un tercer contrato de un dominio distinto (más allá de
  support-agent y code-review-agent) que estrese la gramática del `context.yaml`.
- **Roadmap a v0.4** (ver spec §7): tokenizador real, caducidad/revocación de atestaciones,
  rotación de claves de revisor.

## Correr la implementación de referencia

```bash
cd ccdd_reference
pip install pyyaml jsonschema cryptography
python -m unittest discover -s tests -p "test_*.py"   # 49 tests
```

La implementación de referencia es deliberadamente mínima (Python stdlib + 3 deps) y existe para
hacer **demostrable** cada cláusula de la spec, no para ser eficiente. Cada regla tiene un test que
la fija — si proponés un cambio de comportamiento, acompañalo de un test.

## Estilo

- Mantené el **núcleo determinista** (`ccdd.py`) libre de dependencias de LLM. Lo no-determinista
  (el asistente `review_assist.py`) vive aparte, a propósito.
- Si tu cambio toca el comportamiento del gate o del ensamblado, agregá/actualizá un test.
