import test from "node:test";
import assert from "node:assert/strict";
import { extractBearerToken } from "./auth.js";

test("extractBearerToken returns token from Authorization header", () => {
  const token = extractBearerToken(new Headers({ Authorization: "Bearer abc123" }));
  assert.equal(token, "abc123");
});

test("extractBearerToken accepts lowercase bearer scheme", () => {
  const token = extractBearerToken(new Headers({ Authorization: "bearer xyz" }));
  assert.equal(token, "xyz");
});

test("extractBearerToken accepts mixed-case bearer scheme", () => {
  const token = extractBearerToken(new Headers({ Authorization: "BeArEr tOkEn" }));
  assert.equal(token, "tOkEn");
});

test("extractBearerToken handles spaces after Bearer", () => {
  const token = extractBearerToken(new Headers({ Authorization: "Bearer   spaced-token" }));
  assert.equal(token, "spaced-token");
});

test("extractBearerToken handles tabs after Bearer", () => {
  const token = extractBearerToken(new Headers({ Authorization: "Bearer\t\ttabbed-token" }));
  assert.equal(token, "tabbed-token");
});

test("extractBearerToken handles mixed whitespace after Bearer", () => {
  const token = extractBearerToken(new Headers({ Authorization: "Bearer \t mixed-token" }));
  assert.equal(token, "mixed-token");
});

test("extractBearerToken rejects embedded LF in token", () => {
  const headers = new Headers();
  try {
    headers.append("authorization", "Bearer abc\ndef");
  } catch {
    // Node.js Headers API rejects newlines at construction time.
    // This validates the code path via a raw mock.
    const mockHeaders = {
      get(name: string) {
        if (name.toLowerCase() === "authorization") return "Bearer abc\ndef";
        return null;
      },
    } as Headers;
    assert.throws(
      () => extractBearerToken(mockHeaders),
      /missing bearer token/i,
    );
    return;
  }
  // If Node allowed the newline, our function should still reject it.
  assert.throws(
    () => extractBearerToken(headers),
    /missing bearer token/i,
  );
});

test("extractBearerToken rejects embedded CRLF in token", () => {
  const headers = new Headers();
  try {
    headers.append("authorization", "Bearer abc\r\ndef");
  } catch {
    // Node.js Headers API rejects newlines at construction time.
    // This validates the code path via a raw mock.
    const mockHeaders = {
      get(name: string) {
        if (name.toLowerCase() === "authorization") return "Bearer abc\r\ndef";
        return null;
      },
    } as Headers;
    assert.throws(
      () => extractBearerToken(mockHeaders),
      /missing bearer token/i,
    );
    return;
  }
  // If Node allowed the CRLF, our function should still reject it.
  assert.throws(
    () => extractBearerToken(headers),
    /missing bearer token/i,
  );
});

test("extractBearerToken rejects missing header", () => {
  assert.throws(() => extractBearerToken(new Headers()), /missing bearer token/i);
});

test("extractBearerToken rejects malformed scheme", () => {
  assert.throws(() => extractBearerToken(new Headers({ Authorization: "Token abc123" })), /missing bearer token/i);
});
