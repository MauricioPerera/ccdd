// Test HELD-OUT: vive fuera del workdir del ejecutor. El gate lo corre; el
// ejecutor no lo ve → no puede sobreajustar leyéndolo, solo via feedback.
import { test } from "node:test";
import assert from "node:assert";
import { secretCode } from "../devrepo/secret.mjs";

test("alpha -> 42", () => assert.strictEqual(secretCode("alpha"), 42));
test("bravo -> 7", () => assert.strictEqual(secretCode("bravo"), 7));
test("charlie -> 99", () => assert.strictEqual(secretCode("charlie"), 99));
