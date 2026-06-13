import { test } from "node:test";
import assert from "node:assert";
import { sum } from "./sum.mjs";

test("sum 2 + 3 = 5", () => assert.strictEqual(sum(2, 3), 5));
test("sum -1 + 1 = 0", () => assert.strictEqual(sum(-1, 1), 0));
test("sum 0 + 0 = 0", () => assert.strictEqual(sum(0, 0), 0));
test("sum 10 + 15 = 25", () => assert.strictEqual(sum(10, 15), 25));
