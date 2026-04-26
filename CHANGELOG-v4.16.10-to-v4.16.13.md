# CryptoIZ MCP — Changelog v4.16.10 → v4.16.13

Series perbaikan untuk V2 Dexter gas-sponsored payment yang sudah broken sejak ~11 April 2026 (Dexter merotasi fee payer key tanpa announcement formal). Final fix di v4.16.13.

## v4.16.13 (27 Apr 2026) — V2 FINALLY WORKS

**Critical fix**:
- **Compute Unit Limit 20000 → 30000.** Memo program butuh >13500 CU saat content > 32 char. TransferChecked makan 6200 CU. Total dengan budget 20000 = exhausted, Memo gagal "exceeded CUs meter at BPF instruction". Bumped ke 30000 (Dexter scheme allows ≤40000).
- **Memo content kembali ke `nonceHex` only (32 char hex)** — match April 6-8 working format. Penambahan prefix `'x402:v2:'` di v4.16.12 bikin memo 40 char dan blow CU budget.

**Verified**: TX `3SS9QUzpftmgRq2sdwypy1tc9SQ8TbJa2yyKQVkCnZ1S3bGsBs34HwJhDmLMkRArHF2ojH6WTUh9jucS1rMSAKyV` (27 Apr 21:06 UTC). Fee payer Dexter (gas-sponsored), user wallet only USDC −0.05.

## v4.16.12 (27 Apr 2026)

- **Restore Memo instruction in V2 transaction** (4-ix tx: SetLimit + SetPrice + TransferChecked + Memo). Removal di v4.16.10 was a misread of Dexter spec — empirical April 6-8 logs prove Dexter accepts Memo.
- **Route ALL paid tools to gateway** instead of per-tool endpoints. Per-tool functions (`mcp-alpha-scanner` dst.) hardcode old fee payer; routing semua via `mcp-x402-gateway` v44+ pakai dynamic fee payer dari Dexter `/supported`.

## v4.16.11 (27 Apr 2026)

- **V2 detection by `extra.feePayer` field presence**, not header presence. Per-tool 402 challenges only set body, not `payment-required` header — old client missed V2 path entirely.

## v4.16.10 (27 Apr 2026)

- **V2 PaymentPayload: `x402Version: 2`** (was 1) per Coinbase x402 Issue #1176 spec.
- **Add `accepted` field** to V2 payload (chosen PaymentRequirements verbatim) — required by Dexter `/verify`.
- **Removed bogus `signature: ''` field** from V2 payload — V2 schema only has `payload.transaction`.
- **Removed Memo from V2 tx** — *this was wrong, restored in v4.16.12*.
- **V1 fallback TransferChecked encoding fix**: `Buffer.alloc(10)` (was 9) + `data[9] = 6` (was data[8]). SPL TransferChecked needs 10 bytes (1 disc + 8 amount + 1 decimals).

## Server-side companion fixes

Released alongside (no client action needed):

- **Gateway v43**: x402Version:2 in Dexter `/settle` body + `Idempotency-Key` header
- **Gateway v44**: Dynamic fee payer fetch from Dexter `/supported` (cached 15min) — auto-recovers from future key rotations. Hardcoded fallback `DeXterR2kQm8AvRHnNPatWkE46TfAcMeBDjb6FySoAb8`.
- **Gateway v45**: Verbose `console.log` for Dexter request/response (debug)
- **Gateway v46**: Persist Dexter `/settle` response body to `cryptoiz_system_config` row `debug_dexter_last_settle` for SQL-readable debugging.

## Key facts going forward

- Dexter facilitator at `https://x402.dexter.cash`
- Current SVM signer: `DeXterR2kQm8AvRHnNPatWkE46TfAcMeBDjb6FySoAb8` (rotated from `DEXVS3su...` ~11 Apr 2026)
- Solana CAIP-2: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
- Recipient: `DsKmdkYx49Xc1WhqMUAztwhdYPTqieyC98VmnnJdgpXX`
- Min payment Dexter accepts: 43 atomic USDC ($0.000043)
- Max compute unit limit: 40000 (Dexter scheme_exact_svm)
- Gas: 100% Dexter-sponsored. User wallet doesn't need SOL.
