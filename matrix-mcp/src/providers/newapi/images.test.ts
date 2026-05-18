import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeOutputName } from "./images.js";

test("sanitizeOutputName strips unsafe characters", () => {
  assert.equal(sanitizeOutputName("hello world/../x"), "hello-world-x");
});

test("sanitizeOutputName handles empty output", () => {
  assert.equal(sanitizeOutputName(""), "image");
});

test("sanitizeOutputName handles dots and paths", () => {
  assert.equal(sanitizeOutputName("../../../etc/passwd"), "etc-passwd");
});

test("sanitizeOutputName trims to 80 chars", () => {
  const long = "a".repeat(100);
  assert.equal(sanitizeOutputName(long).length, 80);
});

test("sanitizeOutputName strips sequences of dots", () => {
  assert.equal(sanitizeOutputName("...hello...world..."), "hello-world");
});
