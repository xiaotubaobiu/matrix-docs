export function buildHealthPayload(service: string, version: string) {
  return { ok: true, service, version };
}
