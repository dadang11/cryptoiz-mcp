# CryptoIZ MCP Server

[![npm version](https://img.shields.io/npm/v/cryptoiz-mcp.svg?style=flat-square&color=00d4ff)](https://www.npmjs.com/package/cryptoiz-mcp) [![Latest release](https://img.shields.io/github/v/release/dadang11/cryptoiz-mcp?style=flat-square&color=8b5cf6&label=release)](https://github.com/dadang11/cryptoiz-mcp/releases/latest) [![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

AI-powered Solana DEX whale intelligence for Claude Desktop. Pay per call with USDC on Solana via x402 Dexter protocol.

> **What's new in v4.16.3** (Apr 2026)
> - **Auto-update notifications** — your MCP server now tells you when a new version is published
> - **Dynamic version detection** — gateway reads the latest version from npm registry (no manual sync)
> - **Security hardening** — full audit logging + automated abuse detection with email alerts
>
> [Read full release notes →](https://github.com/dadang11/cryptoiz-mcp/releases/tag/v4.16.3)

## Quick Install (2 commands)

```bash
npm install -g cryptoiz-mcp
npx cryptoiz-mcp-setup YOUR_SOLANA_PRIVATE_KEY
```

Auto-detects OS, finds Claude Desktop config (including Windows MSIX), writes correct config. Restart Claude Desktop and type `get_status`.

### Already installed an older version?

```bash
npm install -g cryptoiz-mcp@latest
```

Then restart Claude Desktop. v4.16.3 is fully backward-compatible with v4.15.x and v4.16.x — no breaking changes.

## Prerequisites

1. **Node.js** v18+ from nodejs.org
2. **Claude Desktop** from claude.ai/download
3. **Solana wallet** with $1-5 USDC (no SOL needed, Dexter sponsors gas)

## Tools and Pricing

| Tool | Price | Data |
|------|-------|------|
| get_whale_alpha | $0.05 | 20 smart money whale/dolphin signals |
| get_whale_divergence | $0.02 | 20 divergence signals (3 types) |
| get_whale_accumulation | $0.02 | Tokens in accumulation phase |
| get_whale_neutral | $0.02 | Tokens in neutral phase |
| get_whale_distribution | $0.02 | Tokens in distribution phase |
| get_btc_regime | $0.01 | BTC macro + Fear/Greed + technicals |
| get_btc_futures_signal | $0.03 | MTF BTC futures scalping signal (4h regime + 5m entry) |
| get_token_ca | FREE | Contract address lookup |
| get_status | FREE | Server health check + update info |

## Manual Config (if auto-installer fails)

### macOS
Config: ~/Library/Application Support/Claude/claude_desktop_config.json

```json
{
  "mcpServers": {
    "cryptoiz": {
      "command": "npx",
      "args": ["-y", "cryptoiz-mcp"],
      "env": {
        "SVM_PRIVATE_KEY": "your-base58-private-key"
      }
    }
  }
}
```

### Windows
IMPORTANT: npx does NOT work on Windows. Use absolute paths.

Config location depends on install type:
- MSIX (most common): %LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json
- Standard: %APPDATA%\Claude\claude_desktop_config.json

Check: run `dir "$env:LOCALAPPDATA\Packages\Claude*"` in PowerShell. If folder exists = MSIX.

```json
{
  "mcpServers": {
    "cryptoiz": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\YOUR_USERNAME\\AppData\\Roaming\\npm\\node_modules\\cryptoiz-mcp\\index.js"],
      "env": {
        "SVM_PRIVATE_KEY": "your-base58-private-key"
      }
    }
  }
}
```

## Troubleshooting

**"No servers added" after setup:**
Config written to wrong path. Windows MSIX reads from LocalAppData, not AppData. Copy:
```powershell
copy "$env:APPDATA\Claude\claude_desktop_config.json" "$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json"
```

**"spawn npx ENOENT" on Windows:**
Use absolute paths, not npx. See Windows config above.

**Server disconnected:**
Check logs: Get-Content "$env:APPDATA\Claude\logs\mcp-server-cryptoiz.log" -Tail 30

## Security

Private key stored only in local config. Never sent to CryptoIZ. Gas sponsored by Dexter. Use a dedicated wallet.

All paid tool endpoints log every call (IP, version, status) for abuse detection. Automated monitoring runs every 15 minutes.

## Links

- Guide: https://cryptoiz.org/McpLanding
- Platform: https://cryptoiz.org
- Dexter: https://dexter.cash/sellers/DsKmdkYx49Xc1WhqMUAztwhdYPTqieyC98VmnnJdgpXX
- Twitter: @cryptoiz_IDN
- npm: https://www.npmjs.com/package/cryptoiz-mcp
- Releases: https://github.com/dadang11/cryptoiz-mcp/releases
