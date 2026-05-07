# Codex-compatible HTTP MCP setup

These examples assume the public MCP endpoint stays at `/mcp`. If the server changes `MCP_PATH`, update this README, `mcp.example.json`, and the nginx/public endpoint examples together.

1. Use `./install.sh` to verify that `mcp.example.json` is present and print the next steps.
2. Copy `mcp.example.json` into your Codex MCP configuration.
3. Replace `Bearer <token>` with a valid `new-api` token.
4. Reload the client.
5. Verify the client can list tools.
6. Run one successful tool call.
