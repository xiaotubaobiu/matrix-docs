export async function newApiRequest(input: {
  baseUrl: string;
  path: string;
  token: string;
  method?: string;
  body?: unknown;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(`${input.baseUrl}${input.path}`, {
      method: input.method ?? "GET",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
