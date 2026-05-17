import { HttpError } from "./errors.js";

export function extractBearerToken(headers: Headers): string {
  const value = headers.get("authorization") ?? headers.get("Authorization");
  if (!value) {
    throw new HttpError(401, "missing_bearer_token", "Missing Bearer token");
  }
  const match = value.match(/^bearer\s+([^\r\n]+)$/i);
  if (!match) {
    throw new HttpError(401, "missing_bearer_token", "Missing Bearer token");
  }
  const token = match[1].trim();
  if (!token) {
    throw new HttpError(401, "missing_bearer_token", "Missing Bearer token");
  }
  return token;
}
