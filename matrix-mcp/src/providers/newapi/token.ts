import { HttpError } from "../../server/errors.js";
import { newApiRequest } from "./client.js";

export async function verifyNewApiToken(input: {
  baseUrl: string;
  verifyPath: string;
  token: string;
  timeoutMs: number;
}) {
  const response = await newApiRequest({
    baseUrl: input.baseUrl,
    path: input.verifyPath,
    token: input.token,
    timeoutMs: input.timeoutMs,
  });

  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, "invalid_token", "Bearer token is invalid or unauthorized");
  }

  if (!response.ok) {
    throw new HttpError(502, "token_verification_failed", `Token verification upstream returned HTTP ${response.status}`);
  }
}
