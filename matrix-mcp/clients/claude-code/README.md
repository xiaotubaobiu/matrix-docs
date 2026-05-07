# Claude Code setup

These examples assume the public MCP endpoint stays at `/mcp`. If the server changes `MCP_PATH`, update this README, `mcp.example.json`, and the nginx/public endpoint examples together.

1. Use `./install.sh` to print the expected config target and verify that `mcp.example.json` is present.
2. Copy `mcp.example.json` into your Claude Code MCP config.
3. Replace `Bearer <token>` with a valid `new-api` token.
4. Restart Claude Code.
5. Confirm the server appears in `/mcp`.
6. Call `mimo_web_search` once to verify connectivity.
