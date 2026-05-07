# matrix-mcp

Unified HTTP MCP service for:
- MiMo web search / web reader / web search reader
- MiMo image, audio, and video understanding
- gpt-image-2 image generation via existing new-api gateway

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

- `mimo_web_search` — Search the web with MiMo and return a concise grounded summary.
- `mimo_web_reader` — Read a public web page with MiMo and answer a focused question.
- `mimo_web_search_reader` — Search first, then synthesize the most relevant results with MiMo.
- `mimo_image_understand` — Understand a public image URL with MiMo.
- `mimo_audio_understand` — Understand a public audio URL with MiMo.
- `mimo_video_understand` — Understand a public video URL with MiMo.
- `generate_image` — Generate one image with `gpt-image-2` and save it on the server.

## Environment

Copy `.env.example` to `.env` and configure at least:
- `DEFAULT_CHAT_MODEL`
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
- `docker-compose.example.yml` shows a standalone container with an output volume for generated images and forces `HOST=0.0.0.0` for container reachability.
- `deploy/nginx.mcp.conf` proxies `/mcp` and preserves the `Authorization` header.
- The Docker, nginx, and client examples all assume `MCP_PATH=/mcp`; if you change that path, update all three together.

## Safety model

- MCP HTTP access requires Bearer auth and verifies the caller token against the configured `NEWAPI_TOKEN_VERIFY_PATH` before dispatching MCP methods.
- URL-based tools validate that user-provided URLs are public HTTP/HTTPS targets.
- Request body buffering is capped by `MAX_REQUEST_BODY_BYTES`.
