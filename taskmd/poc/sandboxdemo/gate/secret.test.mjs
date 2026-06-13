// Test del gate. Vive fuera del sandbox; el orquestador lo INYECTA en el sandbox
// solo durante la ejecución del gate (junto a secret.mjs) y lo borra después.
import { test } from "node:test";
import assert from "node:assert";
import { secretCode } from "./secret.mjs";

test("alpha -> 42", () => assert.strictEqual(secretCode("alpha"), 42));
test("bravo -> 7", () => assert.strictEqual(secretCode("bravo"), 7));
test("charlie -> 99", () => assert.strictEqual(secretCode("charlie"), 99));
