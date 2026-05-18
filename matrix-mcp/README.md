# matrix-image-mcp

HTTP MCP service for generating images through the existing NewAPI gateway.

## Local development

```bash
npm install
npm run dev
```

## Required auth model

Clients must connect with:

```http
Authorization: Bearer <new-api-token>
```

Every MCP POST request to `MCP_PATH` (default: `/mcp`) requires a Bearer token that is verified through the configured `NEWAPI_TOKEN_VERIFY_PATH` before any MCP method is served. The service forwards the caller token through MCP tool execution so `generate_image` can call the existing `new-api` image endpoint on behalf of the caller.

## Public endpoint

These examples assume `MCP_PATH=/mcp`. If you change `MCP_PATH`, update the public endpoint, nginx config, and client example URLs together.

- `https://matrix.000328.xyz:2053/mcp`
- health: `https://matrix.000328.xyz:2053/health-mcp`

## Tools

- `generate_image` — Generate one image with `gpt-image-2` and return it as an MCP image content block. Default quality is `low`; `fast` is accepted as an alias for `low`.

Slow image requests return `status: pending` with a `job_id` before the MCP client timeout window. Call `generate_image` again with that `job_id` to retrieve the finished image.

## Environment

Copy `.env.example` to `.env` and configure at least:
- `NEWAPI_BASE_URL`
- `IMAGE_OUTPUT_DIR`

Optional runtime knobs include:
- `PORT`
- `HOST`
- `MCP_PATH`
- `REQUEST_TIMEOUT_MS`
- `MAX_REQUEST_BODY_BYTES`
- `NEWAPI_TOKEN_VERIFY_PATH`

For the documented Docker/nginx deployment, keep `HOST=0.0.0.0` so the container accepts connections on its published port.

## Build and run

```bash
npm run build
npm start
```

The server listens on `HOST:PORT` and serves:
- `GET /health`
- `POST $MCP_PATH` (default: `/mcp`)

## Deployment notes

- `Dockerfile` builds the TypeScript project and runs the compiled Node server.
- `docker-compose.yml` runs the standalone container on `127.0.0.1:8767`.
- `docker-compose.example.yml` mirrors the deployment shape and forces `HOST=0.0.0.0` for container reachability.
- `deploy/nginx.mcp.conf` proxies `/mcp` and preserves the `Authorization` header.
- The Docker, nginx, and client examples all assume `MCP_PATH=/mcp`; if you change that path, update all three together.

## Safety model

- MCP HTTP access requires Bearer auth and verifies the caller token against the configured `NEWAPI_TOKEN_VERIFY_PATH` before dispatching MCP methods.
- Generated images are returned inline to the MCP client; transient server files are deleted after the response payload is prepared.
- Request body buffering is capped by `MAX_REQUEST_BODY_BYTES`.
