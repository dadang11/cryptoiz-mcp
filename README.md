# cryptoiz-mcp

[![npm version](https://img.shields.io/npm/v/cryptoiz-mcp.svg)](https://www.npmjs.com/package/cryptoiz-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**CryptoIZ MCP Server** — Solana DEX whale intelligence as a Model Context Protocol (MCP) server, with x402 USDC micropayments via Dexter facilitator (gas-sponsored — user only pays USDC, not SOL).

> 9 paid + free tools for AI agents to discover smart money flows, divergence signals, BTC macro regime, and more on Solana DEX.

---

## Features

- **x402 V2 Dexter** payment protocol — gas-sponsored, user wallet only needs USDC ($0.95 covers ~17 paid calls)
- **9 tools** ready for Claude Desktop and any MCP-compatible client
- **Auto-fallback** to V1 (direct USDC transfer) if Dexter is unreachable
- **API key tier** option for higher-throughput agents (skip per-call payment)

## Tools & Pricing

| Tool | Cost | Description |
|---|---|---|
| `get_whale_alpha` | $0.05 USDC | Top 20 alpha signals — whale/dolphin accumulation, entry timing |
| `get_whale_divergence` | $0.02 USDC | Hidden/breakout/classic divergence signals (4h/1d) |
| `get_whale_accumulation` | $0.02 USDC | Tokens with smart money accumulating |
| `get_whale_neutral` | $0.02 USDC | Tokens in transition phase |
| `get_whale_distribution` | $0.02 USDC | Tokens with whales selling |
| `get_btc_regime` | $0.01 USDC | BTC macro regime + sentiment + technicals |
| `get_btc_futures_signal` | $0.03 USDC | BTC futures multi-timeframe signal |
| `get_token_ca` | FREE | Look up Solana contract address by name |
| `get_status` | FREE | Server status, available tools, pricing |

All payments settle on Solana mainnet via [Dexter facilitator](https://x402.dexter.cash). Recipient: `DsKmdkYx49Xc1WhqMUAztwhdYPTqieyC98VmnnJdgpXX`.

## Setup (Claude Desktop)

### 1. Install the package globally

```bash
npm install -g cryptoiz-mcp
```

### 2. Get a Solana wallet private key (base58 encoded)

You need a Solana wallet that has at least **$1 USDC** on mainnet. **No SOL needed** — Dexter sponsors all gas. Recommended: Phantom wallet (export private key as Base58).

### 3. Edit Claude Desktop config

File: `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).

```json
{
  "mcpServers": {
    "cryptoiz": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\<YOU>\\AppData\\Roaming\\npm\\node_modules\\cryptoiz-mcp\\index.js"],
      "env": {
        "SVM_PRIVATE_KEY": "<your_base58_solana_private_key>"
      }
    }
  }
}
```

> **macOS / Linux**: replace path with `/usr/local/bin/node` and the npm global install location (run `npm root -g` to find it).

### 4. Restart Claude Desktop

Then ask Claude: `get cryptoiz status` — you should see version `v4.16.13` and the tool list.

## How V2 Dexter gas-sponsorship works

```
You (USDC wallet) ──┐
                    ├─→ Dexter facilitator ──→ Solana on-chain TX
Dexter (SOL gas) ───┘                              │
                                                   ▼
                                         CryptoIZ recipient
```

- Your wallet **signs** the TX (authorizing USDC transfer)
- Dexter's wallet **pays the gas** (~0.00001 SOL) and broadcasts
- USDC moves from you → CryptoIZ ($0.05 for `get_whale_alpha` etc.)
- Your SOL balance: **untouched**

## Architecture

```
Claude Desktop
     │ (stdio MCP)
     ▼
cryptoiz-mcp (this npm package)
     │ (HTTP)
     ▼
mcp-x402-gateway (Supabase edge function)
     │ (POST /settle)
     ▼
Dexter facilitator (x402.dexter.cash)
     │ (signs + broadcasts)
     ▼
Solana mainnet
```

## Troubleshooting

### "Transaction simulation failed: Attempt to debit account..."
- Your USDC wallet might be empty. Check balance — minimum 1 USDC recommended.
- Restart Claude Desktop fully (kill all `node.exe` processes via Task Manager) — sometimes the MCP child process holds old code in memory.

### "V2 settlement failed"
- Check if you're on the latest version: `npm install -g cryptoiz-mcp@latest` then restart Claude.
- Verify wallet private key is correctly in `SVM_PRIVATE_KEY` env (base58 format).

### Update notifications keep showing
- Run `npm install -g cryptoiz-mcp@latest`
- Force-kill all `node.exe` processes (Task Manager → Details → end task)
- Restart Claude Desktop

## Links

- **Platform**: https://cryptoiz.org
- **Setup guide**: https://cryptoiz.org/McpLanding
- **Twitter**: [@cryptoiz_IDN](https://twitter.com/cryptoiz_IDN)
- **Telegram**: https://t.me/agus_artemiss
- **x402scan listing**: https://x402scan.com/server/mcp.cryptoiz.org

## License

MIT © CryptoIZ
