#!/usr/bin/env python
"""Invocación CANÓNICA de la suite — la única declaración de (directorio, patrón) de tests.

Cierre de la 9ª inconsistencia: antes el patrón `test_*.py` vivía duplicado literal en dos lugares
(el `.yml` del CI y el meta-test), dos declaraciones de la misma intención que podían divergir en
silencio. La clausura real no es sincronizarlas sino COLAPSARLAS a una: el workflow llama a este
script, y el meta-test deriva su conteo de `discover_tests()` de acá. Así hay una sola fuente.

(El residual irreducible —que el CI efectivamente invoque ESTE entrypoint— es la frontera donde un
verificador deja de poder verificarse sin un tercero de confianza: ahí decide un humano, no el código.)

Ruta absoluta vía __file__ → independiente del CWD (cierra de paso la fragilidad por directorio).
"""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
PATTERN = "test_*.py"


def discover_tests():
    return unittest.TestLoader().discover(str(HERE / "tests"), PATTERN)


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(discover_tests())
    sys.exit(0 if result.wasSuccessful() else 1)
