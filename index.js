// cryptoiz-mcp index.js v4.16.4 - x402 V2 Dexter + V1 with memo
'use strict';
var VERSION = 'v4.16.4';
var GATEWAY = 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-x402-gateway';
var TOOL_ENDPOINTS = {
  get_whale_alpha: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-alpha-scanner',
  get_whale_divergence: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-divergence',
  get_whale_accumulation: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-accumulation',
  get_whale_neutral: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-neutral',
  get_whale_distribution: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-distribution',
  get_btc_regime: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-btc-regime',
  get_btc_futures_signal: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-btc-futures',
  get_token_ca: GATEWAY,
  get_status: GATEWAY,
};
var RECIPIENT = 'DsKmdkYx49Xc1WhqMUAztwhdYPTqieyC98VmnnJdgpXX';
var USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
var DEXTER_FEE_PAYER = 'DEXVS3su4dZQWTvvPnLDJLRK1CeeKG6K3QqdzthgAkNV';
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
  var sev = (data && data.update_severity) || 'unknown';
  var latest = (data && data.version_latest) || (headers && headers.get('x-server-version')) || '?';
  var cmd = (data && data.update_command) || 'npm install -g cryptoiz-mcp@latest';
  var changelog = (data && data.changelog_url) || '';
  console.error('[cryptoiz-mcp] ============================================');
  console.error('[cryptoiz-mcp]  UPDATE AVAILABLE: ' + VERSION + ' -> ' + latest);
  console.error('[cryptoiz-mcp]  Severity: ' + sev.toUpperCase());
  console.error('[cryptoiz-mcp]  Run: ' + cmd);
  if (changelog) console.error('[cryptoiz-mcp]  Changelog: ' + changelog);
  console.error('[cryptoiz-mcp] ============================================');
}

var { Connection, PublicKey, Transaction, TransactionMessage, VersionedTransaction, SystemProgram } = require('@solana/web3.js');
var bs58 = require('bs58');
var { Server } = require('@modelcontextprotocol/sdk/server/index.js');
var { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
var { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

function getKeypair() {
  var privKey = process.env.SVM_PRIVATE_KEY;
  if (!privKey) throw new Error('SVM_PRIVATE_KEY not set in environment');
  var decoded = bs58.decode(privKey);
  var { Keypair } = require('@solana/web3.js');
  return Keypair.fromSecretKey(decoded);
}

function findATA(wallet, mint) {
  var walletPk = new PublicKey(wallet);
  var mintPk = new PublicKey(mint);
  var ataProgramPk = new PublicKey(ATA_PROGRAM);
  var tokenProgramPk = new PublicKey(TOKEN_PROGRAM);
  var seeds = [walletPk.toBuffer(), tokenProgramPk.toBuffer(), mintPk.toBuffer()];
  var ata = PublicKey.findProgramAddressSync(seeds, ataProgramPk);
  return ata[0];
}

async function buildV2PaymentPayload(amount, feePayerAddr) {
  var kp = getKeypair();
  var conn = new Connection(SOL_RPC, 'confirmed');
  var userATA = findATA(kp.publicKey.toBase58(), USDC_MINT);
  var recipientATA = findATA(RECIPIENT, USDC_MINT);
  var feePayerPk = new PublicKey(feePayerAddr);
  var computeBudgetPk = new PublicKey(COMPUTE_BUDGET_PROGRAM);
  var memoProgramPk = new PublicKey(MEMO_PROGRAM);
  var tokenProgramPk = new PublicKey(TOKEN_PROGRAM);
  var usdcMintPk = new PublicKey(USDC_MINT);
  var setLimitData = Buffer.alloc(5);
  setLimitData[0] = 0x02;
  var limit = 20000;
  setLimitData.writeUInt32LE(limit, 1);
  var setLimitIx = { programId: computeBudgetPk, keys: [], data: setLimitData };
  var setPriceData = Buffer.alloc(9);
  setPriceData[0] = 0x03;
  var price = 1;
  setPriceData.writeBigUInt64LE(BigInt(price), 1);
  var setPriceIx = { programId: computeBudgetPk, keys: [], data: setPriceData };
  var transferKeys = [
    { pubkey: userATA, isSigner: false, isWritable: true },
    { pubkey: usdcMintPk, isSigner: false, isWritable: false },
    { pubkey: recipientATA, isSigner: false, isWritable: true },
    { pubkey: kp.publicKey, isSigner: true, isWritable: false },
  ];
  var transferData = Buffer.alloc(10);
  transferData[0] = 0x0c;
  var lo = amount & 0xFFFFFFFF;
  var hi = Math.floor(amount / 0x100000000) & 0xFFFFFFFF;
  transferData.writeUInt32LE(lo, 1);
  transferData.writeUInt32LE(hi, 5);
  transferData[9] = 6;
  var transferIx = { programId: tokenProgramPk, keys: transferKeys, data: transferData };
  var nonceBytes = new Uint8Array(16);
  for (var i = 0; i < 16; i++) { nonceBytes[i] = Math.floor(Math.random() * 256); }
  var nonceHex = '';
  for (var j = 0; j < 16; j++) {
    var h = nonceBytes[j].toString(16);
    nonceHex = nonceHex + (h.length < 2 ? '0' + h : h);
  }
  var memoData = Buffer.from(nonceHex, 'utf8');
  var memoIx = { programId: memoProgramPk, keys: [], data: memoData };
  var bhResult = await conn.getLatestBlockhash('confirmed');
  var message = new TransactionMessage({
    payerKey: feePayerPk,
    recentBlockhash: bhResult.blockhash,
    instructions: [setLimitIx, setPriceIx, transferIx, memoIx],
  }).compileToV0Message();
  var vtx = new VersionedTransaction(message);
  vtx.sign([kp]);
  var serialized = vtx.serialize();
  var txB64 = Buffer.from(serialized).toString('base64');
  console.error('[cryptoiz-mcp] V2 tx: 4 ix (Limit=20000 + Price=1 + TransferChecked + Memo), feePayer=' + feePayerAddr.substring(0, 8) + '..., nonce=' + nonceHex.substring(0, 8) + '...');
  return txB64;
}

async function sendUSDC(amount, toolName, nonceHex) {
  var kp = getKeypair();
  var conn = new Connection(SOL_RPC, 'confirmed');
  var userATA = findATA(kp.publicKey.toBase58(), USDC_MINT);
  var recipientATA = findATA(RECIPIENT, USDC_MINT);
  var tokenProgramPk = new PublicKey(TOKEN_PROGRAM);
  var memoProgramPk = new PublicKey(MEMO_PROGRAM);
  var keys = [
    { pubkey: userATA, isSigner: false, isWritable: true },
    { pubkey: new PublicKey(USDC_MINT), isSigner: false, isWritable: false },
    { pubkey: recipientATA, isSigner: false, isWritable: true },
    { pubkey: kp.publicKey, isSigner: true, isWritable: false },
  ];
  var data = Buffer.alloc(9);
  data[0] = 0x0c;
  var lo = amount & 0xFFFFFFFF;
  var hi = Math.floor(amount / 0x100000000) & 0xFFFFFFFF;
  data.writeUInt32LE(lo, 1);
  data.writeUInt32LE(hi, 5);
  data[9-1] = 6;
  var transferIx = {
    programId: tokenProgramPk,
    keys: keys,
    data: data,
  };
  // x402 marker memo: required for indexers (x402scan, etc) to detect this as an x402 payment.
  var x402Nonce = nonceHex || (Date.now().toString(16) + Math.floor(Math.random()*0xffff).toString(16));
  var memoText = 'x402:v1:' + (toolName || 'tool') + ':' + x402Nonce;
  var memoIx = {
    programId: memoProgramPk,
    keys: [],
    data: Buffer.from(memoText, 'utf8'),
  };
  var bhResult = await conn.getLatestBlockhash('confirmed');
  var tx = new Transaction({
    feePayer: kp.publicKey,
    blockhash: bhResult.blockhash,
    lastValidBlockHeight: bhResult.lastValidBlockHeight,
  });
  tx.add(memoIx);
  tx.add(transferIx);
  tx.sign(kp);
  var rawTx = tx.serialize();
  var sig = await conn.sendRawTransaction(rawTx, { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash: bhResult.blockhash, lastValidBlockHeight: bhResult.lastValidBlockHeight }, 'confirmed');
  return sig;
}

function clientHeaders(extra) {
  var v = VERSION.replace(/^v/i, '');
  var h = { 'x-client-version': v };
  if (extra) {
    for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k]; }
  }
  return h;
}

async function callTool(toolName, args) {
  var queryParts = [];
  var baseUrl = TOOL_ENDPOINTS[toolName] || GATEWAY;
  if (toolName === 'get_status' || toolName === 'get_token_ca') {
    queryParts.push('tool=' + toolName);
  } else {
    queryParts.push('tool=' + toolName);
  }
  if ((toolName === 'get_whale_divergence' || toolName === 'get_divergence') && args && args.timeframe) {
    queryParts.push('tf=' + args.timeframe);
  }
  if ((toolName === 'get_token_ca') && args && args.name) {
    queryParts.push('name=' + encodeURIComponent(args.name));
  }
  var url = queryParts.length > 0 ? baseUrl + '?' + queryParts.join('&') : baseUrl;
  var resp1 = await fetch(url, { headers: clientHeaders() });
  if (resp1.status === 200) {
    var data200 = await resp1.json();
    notifyUpdate(data200, resp1.headers);
    return data200;
  }
  if (resp1.status !== 402) {
    var errText = await resp1.text();
    throw new Error('Server error ' + resp1.status + ': ' + errText.substring(0, 200));
  }
  var paymentRequirements = null;
  var useV2 = false;
  var prHeader = resp1.headers.get('payment-required');
  if (prHeader) {
    try {
      var prDecoded = Buffer.from(prHeader, 'base64').toString('utf8');
      var prArray = JSON.parse(prDecoded);
      if (prArray && prArray.length > 0) {
        paymentRequirements = prArray[0];
        useV2 = true;
      }
    } catch (_e) {}
  }
  if (!paymentRequirements) {
    var body402 = await resp1.json();
    if (body402 && body402.accepts && body402.accepts.length > 0) {
      paymentRequirements = body402.accepts[0];
    }
  }
  if (!paymentRequirements) throw new Error('No payment requirements found in 402 response');
  var amount = parseInt(paymentRequirements.maxAmountRequired || paymentRequirements.amount || '10000');
  var displayAmount = (amount / 1000000).toFixed(4);
  var hasFeePayer = paymentRequirements.extra && paymentRequirements.extra.feePayer;
  var paymentHeader = '';
  var headerName = '';
  if (useV2 && hasFeePayer) {
    var v2FeePayer = paymentRequirements.extra.feePayer;
    console.error('[cryptoiz-mcp] V2 mode: 4-ix tx (Limit+Price+TransferChecked+Memo), feePayer=' + v2FeePayer.substring(0, 8) + '...');
    console.error('[cryptoiz-mcp] Sending ' + displayAmount + ' USDC via Dexter for ' + toolName);
    try {
      var txB64 = await buildV2PaymentPayload(amount, v2FeePayer);
      var v2Payload = {
        x402Version: 1,
        scheme: 'exact',
        network: paymentRequirements.network || 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        payload: { transaction: txB64, signature: '' }
      };
      paymentHeader = Buffer.from(JSON.stringify(v2Payload)).toString('base64');
      headerName = 'payment-signature';
    } catch (v2Err) {
      console.error('[cryptoiz-mcp] V2 build failed: ' + v2Err.message + ' -> falling back to V1');
      useV2 = false;
    }
  }
  if (!paymentHeader) {
    useV2 = false;
    console.error('[cryptoiz-mcp] V1 mode: sending USDC on-chain...');
    console.error('[cryptoiz-mcp] Sending ' + displayAmount + ' USDC on-chain for ' + toolName);
    var sig = await sendUSDC(amount, toolName);
    console.error('[cryptoiz-mcp] V1 TX confirmed: ' + sig);
    var v1Payload = { signature: sig };
    paymentHeader = Buffer.from(JSON.stringify(v1Payload)).toString('base64');
    headerName = 'x-payment';
  }
  var headers2obj = {};
  headers2obj[headerName] = paymentHeader;
  var resp2 = await fetch(url, { headers: clientHeaders(headers2obj) });
  if (resp2.status !== 200 && useV2) {
    var v2ErrBody = await resp2.text();
    console.error('[cryptoiz-mcp] V2 settle failed, auto-fallback to V1: ' + v2ErrBody.substring(0, 200));
    console.error('[cryptoiz-mcp] Auto-fallback to V1 (sendUSDC on-chain)...');
    try {
      var fallbackSig = await sendUSDC(amount, toolName);
      console.error('[cryptoiz-mcp] V1 fallback TX confirmed: ' + fallbackSig);
      var v1FallbackPayload = { signature: fallbackSig };
      var v1FallbackHeader = Buffer.from(JSON.stringify(v1FallbackPayload)).toString('base64');
      resp2 = await fetch(url, { headers: clientHeaders({ 'x-payment': v1FallbackHeader }) });
    } catch (v1Err) {
      throw new Error('V1 fallback failed: ' + v1Err.message);
    }
  }
  if (resp2.status !== 200) {
    var errBody = await resp2.text();
    throw new Error('Payment failed ' + resp2.status + ': ' + errBody.substring(0, 300));
  }
  var receipt = resp2.headers.get('payment-response') || resp2.headers.get('x-payment-response');
  if (receipt) {
    try {
      var receiptData = JSON.parse(Buffer.from(receipt, 'base64').toString('utf8'));
      console.error('[cryptoiz-mcp] Payment receipt: TX=' + (receiptData.transaction || 'n/a') + ' via ' + (receiptData.version || 'unknown'));
    } catch (_e) {}
  }
  var data = await resp2.json();
  notifyUpdate(data, resp2.headers);
  return data;
}

var TOOLS = [
  { name: 'get_whale_alpha', description: 'Get alpha scanner signals - early accumulation tokens on Solana DEX. Cost: $0.05 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_whale_divergence', description: 'Get whale divergence signals - price vs holder divergence. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: { timeframe: { type: 'string', enum: ['4h', '1d'], description: 'Timeframe (default: 4h)' } }, additionalProperties: false } },
  { name: 'get_whale_accumulation', description: 'Get tokens in accumulation phase - smart money entering. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_whale_neutral', description: 'Get tokens in neutral phase - no clear direction. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_whale_distribution', description: 'Get tokens in distribution phase - whale selling detected. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_btc_regime', description: 'Get BTC macro regime - BULL/BEAR/NEUTRAL with sentiment data. Cost: $0.01 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_btc_futures_signal', description: 'Get BTC futures signal - long/short based on MTF analysis. Cost: $0.03 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_token_ca', description: 'Get contract address for a token by name. FREE', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Token name to search' } }, required: ['name'], additionalProperties: false } },
  { name: 'get_status', description: 'Get CryptoIZ MCP server status and available tools. FREE', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
];

var server = new Server(
  { name: 'cryptoiz-mcp', version: VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  var toolName = request.params.name;
  var args = request.params.arguments || {};
  try {
    var result = await callTool(toolName, args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
  }
});

async function main() {
  var transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[cryptoiz-mcp] ' + VERSION + ' running on stdio (x402 V2 Dexter + V1 with memo)');
}

main().catch(console.error);
