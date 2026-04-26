# CryptoIZ MCP Server - Solana DEX whale intelligence via x402
# https://github.com/dadang11/cryptoiz-mcp

FROM node:20-alpine

WORKDIR /app

# Install package globally so the binary is on PATH
RUN npm install -g cryptoiz-mcp@latest

# Default to running the MCP server (stdio transport)
ENTRYPOINT ["cryptoiz-mcp"]

# To run setup wizard instead:
#   docker run -it --rm cryptoiz/mcp:latest cryptoiz-mcp-setup

# Healthcheck via free get_status tool
# (The stdio transport reads/writes JSON-RPC over stdin/stdout, so a real
# healthcheck would need an MCP client. This image is meant to be invoked by
# Claude Desktop or similar MCP host.)

LABEL org.opencontainers.image.source="https://github.com/dadang11/cryptoiz-mcp"
LABEL org.opencontainers.image.description="CryptoIZ MCP Server - Solana DEX whale intelligence via Claude Desktop with x402 USDC micropayments"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.url="https://cryptoiz.org/McpLanding"
LABEL org.opencontainers.image.documentation="https://github.com/dadang11/cryptoiz-mcp#readme"
LABEL org.opencontainers.image.vendor="CryptoIZ"
