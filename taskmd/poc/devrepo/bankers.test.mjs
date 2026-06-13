import { test } from "node:test";
import assert from "node:assert";
import { roundHalfEven } from "./bankers.mjs";

// Redondeo "half to even" (banker's): los .5 van al entero PAR más cercano.
test("0.5 -> 0", () => assert.strictEqual(roundHalfEven(0.5), 0));
test("1.5 -> 2", () => assert.strictEqual(roundHalfEven(1.5), 2));
test("2.5 -> 2", () => assert.strictEqual(roundHalfEven(2.5), 2));
test("3.5 -> 4", () => assert.strictEqual(roundHalfEven(3.5), 4));
test("-2.5 -> -2", () => assert.strictEqual(roundHalfEven(-2.5), -2));
test("2.4 -> 2", () => assert.strictEqual(roundHalfEven(2.4), 2));
test("2.6 -> 3", () => assert.strictEqual(roundHalfEven(2.6), 3));
