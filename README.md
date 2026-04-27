# cryptoiz-mcp

[![npm version](https://img.shields.io/npm/v/cryptoiz-mcp.svg)](https://www.npmjs.com/package/cryptoiz-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![x402scan](https://img.shields.io/badge/x402scan-listed-blue)](https://x402scan.com/server/cbd8fff5-d636-4331-b22b-3291717a4e9e)
[![MCP Marketplace](https://img.shields.io/badge/MCP_Marketplace-listed-green)](https://mcp-marketplace.io/server/io-github-dadang11-cryptoiz)

**CryptoIZ MCP Server** — Solana DEX whale intelligence as a Model Context Protocol (MCP) server. 9 tools (7 paid + 2 free) for Claude Desktop, Cursor, Codex, and any agentcash-compatible client. Native Solana via x402 V2 + Dexter facilitator (gas-sponsored — no SOL needed, only USDC).

## ⚡ Recommended Install (1 line)

```bash
npx agentcash add https://mcp.cryptoiz.org
```

That's it. agentcash auto-generates a Solana wallet at `~/.agentcash/wallet.json` (no private key in your Claude config). Fund with $1-5 USDC via `npx agentcash fund` and you're ready.

**Why agentcash:**
- ✅ No private key in Claude Desktop config
- ✅ Wallet auto-generated and isolated
- ✅ Gas sponsored by Dexter (zero SOL needed)
- ✅ Update tools without reinstalling client
- ✅ One wallet across ALL x402 services (CryptoIZ, HYRE, etc.)

## 5 Specialized Sub-Agents

Pick what you need:

```bash
npx agentcash add https://mcp.cryptoiz.org/agents/alpha          # Whale alpha signals only
npx agentcash add https://mcp.cryptoiz.org/agents/btc            # BTC regime + futures
npx agentcash add https://mcp.cryptoiz.org/agents/phases         # Accumulation/Neutral/Distribution
npx agentcash add https://mcp.cryptoiz.org/agents/divergence     # Divergence patterns
npx agentcash add https://mcp.cryptoiz.org/agents/deep-research  # Token deep-dive combo
```

## Tools & Pricing

| Tool | Cost | Description |
|---|---|---|
| `get_whale_alpha` | $0.05 USDC | Top 20 alpha signals — whale/dolphin accumulation, entry timing |
| `get_whale_divergence` | $0.02 USDC | Hidden/breakout/classic divergence signals (4h/1d) |
| `get_whale_accumulation` | $0.02 USDC | Tokens with smart money accumulating |
| `get_whale_neutral` | $0.02 USDC | Tokens in transition phase |
| `get_whale_distribution` | $0.02 USDC | Tokens with whales selling (exit signal) |
| `get_btc_regime` | $0.01 USDC | BTC macro regime + sentiment + technicals |
| `get_btc_futures_signal` | $0.03 USDC | BTC futures multi-timeframe signal (54% WR) |
| `get_token_ca` | FREE | Look up Solana contract address by name |
| `get_status` | FREE | Server status, available tools, pricing |

All payments settle on Solana mainnet via [Dexter facilitator](https://x402.dexter.cash). Recipient: `DsKmdkYx49Xc1WhqMUAztwhdYPTqieyC98VmnnJdgpXX`.

## Legacy Setup (Advanced — not recommended)

For users who prefer self-custody with their own Solana wallet:

### 1. Install the package globally

```bash
npm install -g cryptoiz-mcp
```

### 2. Get a Solana wallet private key (base58)

You need a Solana wallet with at least **$1 USDC** on mainnet. **No SOL needed** — Dexter sponsors all gas. Recommended: dedicated wallet, NOT your main wallet. Phantom: Settings > Security > Export Private Key.

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

### 4. Restart Claude Desktop

Then ask Claude: `get cryptoiz status` — you should see version `v4.16.14` and the tool list.

## Security

- **agentcash flow** (recommended): private key auto-generated and isolated, never in Claude config
- **Gas-sponsored**: Dexter facilitator pays all gas (you only pay USDC)
- **Server-side validation**: every payment verified via Dexter `/settle` before serving data
- **x402 V2 spec compliant**: open standard, no custom protocol
- **No tracking**: only on-chain transaction signature is recorded for replay protection
- **Dedicated wallet recommended** for legacy npm install (don't use your main wallet)

## Listed at

- [MCP Marketplace](https://mcp-marketplace.io/server/io-github-dadang11-cryptoiz)
- [x402scan](https://x402scan.com/server/cbd8fff5-d636-4331-b22b-3291717a4e9e) — 94+ tx, $2.80+ volume
- [Official MCP Registry](https://github.com/modelcontextprotocol/registry)
- MPPscan (pending)

## Architecture

```
Claude Desktop / Cursor / Codex
     │ (MCP)
     ▼
agentcash CLI (or cryptoiz-mcp legacy npm)
     │ (HTTP)
     ▼
mcp.cryptoiz.org gateway (Cloudflare Worker + Supabase Edge Function)
     │ (POST /settle)
     ▼
Dexter facilitator (x402.dexter.cash)
     │ (signs + broadcasts)
     ▼
Solana mainnet
```

## Troubleshooting

### "Transaction simulation failed"
Update to latest: `npx agentcash add https://mcp.cryptoiz.org` (or `npm install -g cryptoiz-mcp@latest` for legacy).

### "Server disconnected" on Windows
Use absolute paths in Claude config (legacy npm only). agentcash flow doesn't have this issue.

### Update notifications keep showing
Run `npm install -g cryptoiz-mcp@latest`, force-kill all `node.exe` processes via Task Manager, then restart Claude Desktop. Or switch to agentcash for auto-updates.

## Links

- **Platform**: https://cryptoiz.org
- **Setup guide**: https://cryptoiz.org/McpLanding
- **Twitter**: [@cryptoiz_IDN](https://twitter.com/cryptoiz_IDN)
- **Telegram**: https://t.me/agus_artemiss
- **MCP Marketplace**: https://mcp-marketplace.io/server/io-github-dadang11-cryptoiz
- **x402scan**: https://x402scan.com/server/mcp.cryptoiz.org

## License

MIT © CryptoIZ
