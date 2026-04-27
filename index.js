'use strict';
var VERSION = 'v4.16.15';
var GATEWAY = 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-x402-gateway';
// FIX v4.16.12: route ALL paid tools to gateway. Per-tool endpoints (mcp-alpha-scanner etc.)
// have stale hardcoded fee payer that breaks after Dexter key rotation. Gateway has dynamic
// fee payer fetched from /supported. Single source of truth = no per-tool drift.
var TOOL_ENDPOINTS = {
  get_whale_alpha: GATEWAY,
  get_whale_divergence: GATEWAY,
  get_whale_accumulation: GATEWAY,
  get_whale_neutral: GATEWAY,
  get_whale_distribution: GATEWAY,
  get_btc_regime: GATEWAY,
  get_btc_futures_signal: GATEWAY,
  get_token_ca: GATEWAY,
  get_status: GATEWAY,
};
var RECIPIENT = 'DsKmdkYx49Xc1WhqMUAztwhdYPTqieyC98VmnnJdgpXX';
var USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
var SOL_RPC = 'https://api.mainnet-beta.solana.com';
var TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
var ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
var MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
var COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';

var _updateNotified = false;
function notifyUpdate(data, headers) {
  if (_updateNotified) return;
  if (!headers || headers.get('x-update-available') !== '1') return;
  _updateNotified = true;
  var latest = (data && data.version_latest) || '?';
  var cmd = (data && data.update_command) || 'npm install -g cryptoiz-mcp@latest';
  console.error('[cryptoiz-mcp] UPDATE: ' + VERSION + ' -> ' + latest + ' | Run: ' + cmd);
}

var solana = require('@solana/web3.js');
var Connection = solana.Connection;
var PublicKey = solana.PublicKey;
var Transaction = solana.Transaction;
var TransactionMessage = solana.TransactionMessage;
var VersionedTransaction = solana.VersionedTransaction;
var Keypair = solana.Keypair;
// Fix bs58 v6 ESM-only issue: support both CJS (v5) and ESM-compiled (v6)
var _bs58mod = require('bs58');
var bs58 = _bs58mod.default || _bs58mod;
var Server = require('@modelcontextprotocol/sdk/server/index.js').Server;
var StdioServerTransport = require('@modelcontextprotocol/sdk/server/stdio.js').StdioServerTransport;
var CallToolRequestSchema = require('@modelcontextprotocol/sdk/types.js').CallToolRequestSchema;
var ListToolsRequestSchema = require('@modelcontextprotocol/sdk/types.js').ListToolsRequestSchema;

function getKeypair() {
  var privKey = process.env.SVM_PRIVATE_KEY;
  if (!privKey) throw new Error('SVM_PRIVATE_KEY not set in environment');
  return Keypair.fromSecretKey(bs58.decode(privKey));
}

function findATA(wallet, mint) {
  var walletPk = new PublicKey(wallet);
  var mintPk = new PublicKey(mint);
  var ataPk = new PublicKey(ATA_PROGRAM);
  var tokPk = new PublicKey(TOKEN_PROGRAM);
  return PublicKey.findProgramAddressSync([walletPk.toBuffer(), tokPk.toBuffer(), mintPk.toBuffer()], ataPk)[0];
}

// V2: Dexter gas-sponsored. 4-ix tx: Limit + Price + TransferChecked + Memo(nonce)
// Dexter pays SOL gas — user only needs USDC
async function buildV2PaymentPayload(amount, feePayerAddr) {
  var kp = getKeypair();
  var conn = new Connection(SOL_RPC, 'confirmed');
  var userATA = findATA(kp.publicKey.toBase58(), USDC_MINT);
  var recipientATA = findATA(RECIPIENT, USDC_MINT);
  var feePayerPk = new PublicKey(feePayerAddr);
  var computeBudgetPk = new PublicKey(COMPUTE_BUDGET_PROGRAM);
  var tokenProgramPk = new PublicKey(TOKEN_PROGRAM);
  var usdcMintPk = new PublicKey(USDC_MINT);
  // FIX v4.16.13: ComputeUnitLimit 20000 -> 30000.
  // Memo program needs >13500 CU when content is 'x402:v2:'+32char hex; old (April 6-8)
  // working code used just 32-char nonceHex which fit in 20000 budget. Bumping limit gives
  // headroom for slightly longer memo content. Dexter spec allows up to 40000.
  var setLimitData = Buffer.alloc(5);
  setLimitData[0] = 0x02;
  setLimitData.writeUInt32LE(30000, 1);
  var setLimitIx = { programId: computeBudgetPk, keys: [], data: setLimitData };
  // ComputeUnitPrice(1)
  var setPriceData = Buffer.alloc(9);
  setPriceData[0] = 0x03;
  setPriceData.writeBigUInt64LE(BigInt(1), 1);
  var setPriceIx = { programId: computeBudgetPk, keys: [], data: setPriceData };
  // TransferChecked
  var transferKeys = [
    { pubkey: userATA, isSigner: false, isWritable: true },
    { pubkey: usdcMintPk, isSigner: false, isWritable: false },
    { pubkey: recipientATA, isSigner: false, isWritable: true },
    { pubkey: kp.publicKey, isSigner: true, isWritable: false },
  ];
  var transferData = Buffer.alloc(10);
  transferData[0] = 0x0c;
  transferData.writeUInt32LE(amount & 0xFFFFFFFF, 1);
  transferData.writeUInt32LE(Math.floor(amount / 0x100000000) & 0xFFFFFFFF, 5);
  transferData[9] = 6;
  var transferIx = { programId: tokenProgramPk, keys: transferKeys, data: transferData };
  // FIX v4.16.12: RESTORE Memo instruction in V2 (4-ix tx: Limit+Price+TransferChecked+Memo).
  // Empirical: April 6-8 logs prove V2 with memo accepted by Dexter. Removing memo (v4.16.10)
  // didn't fix anything — the actual bug was Dexter key rotation, fixed in gateway v44.
  // Memo also makes TX visible to x402scan (memo carries x402 nonce marker).
  var memoProgramPk = new PublicKey(MEMO_PROGRAM);
  var nonceBytes = new Uint8Array(16);
  for (var i = 0; i < 16; i++) nonceBytes[i] = Math.floor(Math.random() * 256);
  var nonceHex = Array.from(nonceBytes).map(function(b) { return b.toString(16).padStart(2,'0'); }).join('');
  // FIX v4.16.13: memo = just nonceHex (matches April 6-8 working V2 format).
  // Adding 'x402:v2:' prefix made memo too long for 20000 CU budget.
  var memoIx = { programId: memoProgramPk, keys: [], data: Buffer.from(nonceHex, 'utf8') };
  var bh = await conn.getLatestBlockhash('confirmed');
  var message = new TransactionMessage({
    payerKey: feePayerPk,
    recentBlockhash: bh.blockhash,
    instructions: [setLimitIx, setPriceIx, transferIx, memoIx],
  }).compileToV0Message();
  var vtx = new VersionedTransaction(message);
  vtx.sign([kp]);
  var txB64 = Buffer.from(vtx.serialize()).toString('base64');
  console.error('[cryptoiz-mcp] V2 tx built (Dexter gas-sponsored), 4 ix limit=30000');
  return txB64;
}

// V1: direct on-chain, user pays SOL gas (fallback only)
async function sendUSDC(amount, toolName) {
  var kp = getKeypair();
  var conn = new Connection(SOL_RPC, 'confirmed');
  var userATA = findATA(kp.publicKey.toBase58(), USDC_MINT);
  var recipientATA = findATA(RECIPIENT, USDC_MINT);
  var keys = [
    { pubkey: userATA, isSigner: false, isWritable: true },
    { pubkey: new PublicKey(USDC_MINT), isSigner: false, isWritable: false },
    { pubkey: recipientATA, isSigner: false, isWritable: true },
    { pubkey: kp.publicKey, isSigner: true, isWritable: false },
  ];
  // FIX v4.16.10: TransferChecked needs 10 bytes (1 disc + 8 amount + 1 decimals)
  var data = Buffer.alloc(10);
  data[0] = 0x0c;
  data.writeUInt32LE(amount & 0xFFFFFFFF, 1);
  data.writeUInt32LE(Math.floor(amount / 0x100000000) & 0xFFFFFFFF, 5);
  data[9] = 6;
  var transferIx = { programId: new PublicKey(TOKEN_PROGRAM), keys: keys, data: data };
  var nonce = Date.now().toString(16) + Math.floor(Math.random()*0xffff).toString(16);
  var memoIx = {
    programId: new PublicKey(MEMO_PROGRAM),
    keys: [],
    data: Buffer.from('x402:v1:' + (toolName || 'tool') + ':' + nonce, 'utf8')
  };
  var bh = await conn.getLatestBlockhash('confirmed');
  var tx = new Transaction({ feePayer: kp.publicKey, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight });
  tx.add(memoIx);
  tx.add(transferIx);
  tx.sign(kp);
  var sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 'confirmed');
  console.error('[cryptoiz-mcp] V1 TX: ' + sig);
  return sig;
}

function clientHeaders(extra) {
  var h = { 'x-client-version': VERSION.replace(/^v/i, '') };
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
  return h;
}

// v4.16.14: input validation per tool — defense in depth, server-side double-validates.
function validateArgs(toolName, args) {
  if (args == null) return {}; // Empty args ok
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Invalid args: expected object, got ' + typeof args);
  }
  var clean = {};
  if (toolName === 'get_whale_divergence') {
    if (args.timeframe != null) {
      if (typeof args.timeframe !== 'string') throw new Error('timeframe must be string');
      if (args.timeframe !== '4h' && args.timeframe !== '1d') throw new Error("timeframe must be '4h' or '1d'");
      clean.timeframe = args.timeframe;
    }
  } else if (toolName === 'get_token_ca') {
    if (args.name == null) throw new Error('name is required for get_token_ca');
    if (typeof args.name !== 'string') throw new Error('name must be string');
    var trimmed = args.name.trim();
    if (trimmed.length < 1 || trimmed.length > 64) throw new Error('name length must be 1-64 chars');
    if (!/^[a-zA-Z0-9 _\-\$\.\u00c0-\uffff]+$/.test(trimmed)) throw new Error('name contains invalid chars');
    clean.name = trimmed;
  }
  // Other tools accept no args — anything passed is silently dropped.
  return clean;
}

async function callTool(toolName, args) {
  args = validateArgs(toolName, args);
  var queryParts = ['tool=' + toolName];
  if (toolName === 'get_whale_divergence' && args && args.timeframe) queryParts.push('tf=' + args.timeframe);
  if (toolName === 'get_token_ca' && args && args.name) queryParts.push('name=' + encodeURIComponent(args.name));
  var url = (TOOL_ENDPOINTS[toolName] || GATEWAY) + '?' + queryParts.join('&');

  // Step 1: discovery
  var resp1 = await fetch(url, { headers: clientHeaders() });
  if (resp1.status === 200) { var d = await resp1.json(); notifyUpdate(d, resp1.headers); return d; }
  if (resp1.status !== 402) throw new Error('Server error ' + resp1.status + ': ' + (await resp1.text()).substring(0, 200));

  // Step 2: parse payment requirements
  // FIX v4.16.11: detect V2 by extra.feePayer presence (Dexter sponsorship marker),
  // not by header. Per-tool endpoints (mcp-alpha-scanner, mcp-btc-regime, etc.) only
  // serve 402 in body, no payment-required header. Header check stays as fast path.
  var payReq = null;
  var prHeader = resp1.headers.get('payment-required');
  if (prHeader) {
    try {
      var arr = JSON.parse(Buffer.from(prHeader, 'base64').toString('utf8'));
      if (arr && arr[0]) payReq = arr[0];
    } catch(_e) {}
  }
  if (!payReq) {
    var b402 = await resp1.json();
    if (b402 && b402.accepts && b402.accepts[0]) payReq = b402.accepts[0];
  }
  if (!payReq) throw new Error('No payment requirements in 402');
  // V2 = Dexter sponsored gas = extra.feePayer field present (independent of transport)
  var useV2 = !!(payReq.extra && payReq.extra.feePayer);

  var amount = parseInt(payReq.maxAmountRequired || payReq.amount || '10000');
  var hasFeePayer = payReq.extra && payReq.extra.feePayer;
  var paymentHeader = '';
  var headerName = '';

  // Step 3: Try V2 Dexter (gas-sponsored by Dexter — user only needs USDC)
  if (useV2 && hasFeePayer) {
    console.error('[cryptoiz-mcp] V2 mode: Dexter gas-sponsored, paying ' + (amount/1000000).toFixed(4) + ' USDC');
    try {
      var txB64 = await buildV2PaymentPayload(amount, payReq.extra.feePayer);
      // FIX v4.16.10: x402Version:2 (was 1), add 'accepted' (chosen PaymentRequirements
      // verbatim — Dexter /verify needs this to match amount/asset/payTo). Removed bogus
      // signature field — V2 schema only has payload.transaction.
      var v2Payload = {
        x402Version: 2,
        scheme: 'exact',
        network: payReq.network || 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        accepted: payReq,
        payload: { transaction: txB64 },
        extensions: {}
      };
      paymentHeader = Buffer.from(JSON.stringify(v2Payload)).toString('base64');
      headerName = 'payment-signature';
    } catch(v2Err) {
      console.error('[cryptoiz-mcp] V2 build failed: ' + v2Err.message + ' -> fallback V1');
      useV2 = false;
    }
  }

  // Step 4: V1 fallback (user pays gas — only if V2 failed)
  if (!paymentHeader) {
    console.error('[cryptoiz-mcp] V1 fallback: direct on-chain transfer');
    var sig = await sendUSDC(amount, toolName);
    paymentHeader = Buffer.from(JSON.stringify({ signature: sig })).toString('base64');
    headerName = 'x-payment';
  }

  // Step 5: submit payment
  var headers2 = {};
  headers2[headerName] = paymentHeader;
  var resp2 = await fetch(url, { headers: clientHeaders(headers2) });

  // Step 6: if V2 failed at server, retry with V1
  if (resp2.status !== 200 && useV2) {
    console.error('[cryptoiz-mcp] V2 settle failed, trying V1 fallback...');
    var fallbackSig = await sendUSDC(amount, toolName);
    var v1Header = Buffer.from(JSON.stringify({ signature: fallbackSig })).toString('base64');
    resp2 = await fetch(url, { headers: clientHeaders({ 'x-payment': v1Header }) });
  }

  if (resp2.status !== 200) throw new Error('Payment failed ' + resp2.status + ': ' + (await resp2.text()).substring(0, 300));
  var data = await resp2.json();
  notifyUpdate(data, resp2.headers);
  return data;
}

var TOOLS = [
  { name: 'get_whale_alpha', description: 'Alpha scanner - early accumulation tokens. Cost: $0.05 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_whale_divergence', description: 'Whale divergence signals. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: { timeframe: { type: 'string', enum: ['4h', '1d'] } }, additionalProperties: false } },
  { name: 'get_whale_accumulation', description: 'Accumulation phase tokens. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_whale_neutral', description: 'Neutral phase tokens. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_whale_distribution', description: 'Distribution phase tokens. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_btc_regime', description: 'BTC macro regime. Cost: $0.01 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_btc_futures_signal', description: 'BTC futures signal. Cost: $0.03 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_token_ca', description: 'Token contract address. FREE', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } },
  { name: 'get_status', description: 'CryptoIZ MCP status. FREE', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
];

var server = new Server({ name: 'cryptoiz-mcp', version: VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    var result = await callTool(request.params.name, request.params.arguments || {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch(e) {
    return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
  }
});

async function main() {
  var transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[cryptoiz-mcp] ' + VERSION + ' running (V2 Dexter gas-sponsored + V1 fallback)');
}
main().catch(console.error);
