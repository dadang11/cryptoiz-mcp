'use strict';
var VERSION = 'v4.16.5';
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
var SOL_RPC = 'https://api.mainnet-beta.solana.com';
var TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
var ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
var MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

var _updateNotified = false;
function notifyUpdate(data, headers) {
  if (_updateNotified) return;
  if (!headers || headers.get('x-update-available') !== '1') return;
  _updateNotified = true;
  var latest = (data && data.version_latest) || (headers && headers.get('x-server-version')) || '?';
  var cmd = (data && data.update_command) || 'npm install -g cryptoiz-mcp@latest';
  console.error('[cryptoiz-mcp] UPDATE: ' + VERSION + ' -> ' + latest + ' | Run: ' + cmd);
}

var { Connection, PublicKey, Transaction } = require('@solana/web3.js');
var bs58 = require('bs58');
var { Server } = require('@modelcontextprotocol/sdk/server/index.js');
var { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
var { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

function getKeypair() {
  var privKey = process.env.SVM_PRIVATE_KEY;
  if (!privKey) throw new Error('SVM_PRIVATE_KEY not set');
  var { Keypair } = require('@solana/web3.js');
  return Keypair.fromSecretKey(bs58.decode(privKey));
}

function findATA(wallet, mint) {
  var walletPk = new PublicKey(wallet);
  var mintPk = new PublicKey(mint);
  var ataProgramPk = new PublicKey(ATA_PROGRAM);
  var tokenProgramPk = new PublicKey(TOKEN_PROGRAM);
  var seeds = [walletPk.toBuffer(), tokenProgramPk.toBuffer(), mintPk.toBuffer()];
  return PublicKey.findProgramAddressSync(seeds, ataProgramPk)[0];
}

// V1: direct on-chain USDC transfer from user wallet + x402 memo for indexer
async function sendUSDC(amount, toolName) {
  var kp = getKeypair();
  var conn = new Connection(SOL_RPC, 'confirmed');
  var userATA = findATA(kp.publicKey.toBase58(), USDC_MINT);
  var recipientATA = findATA(RECIPIENT, USDC_MINT);
  var tokenProgramPk = new PublicKey(TOKEN_PROGRAM);
  var memoProgramPk = new PublicKey(MEMO_PROGRAM);
  // Build TransferChecked instruction
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
  data[8] = 6;
  var transferIx = { programId: tokenProgramPk, keys: keys, data: data };
  // x402 memo for indexer visibility
  var nonce = Date.now().toString(16) + Math.floor(Math.random()*0xffff).toString(16);
  var memoText = 'x402:v1:' + (toolName || 'tool') + ':' + nonce;
  var memoIx = { programId: memoProgramPk, keys: [], data: Buffer.from(memoText, 'utf8') };
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

async function callTool(toolName, args) {
  var queryParts = ['tool=' + toolName];
  if ((toolName === 'get_whale_divergence') && args && args.timeframe) queryParts.push('tf=' + args.timeframe);
  if (toolName === 'get_token_ca' && args && args.name) queryParts.push('name=' + encodeURIComponent(args.name));
  var baseUrl = TOOL_ENDPOINTS[toolName] || GATEWAY;
  var url = baseUrl + '?' + queryParts.join('&');

  // Step 1: discovery
  var resp1 = await fetch(url, { headers: clientHeaders() });
  if (resp1.status === 200) {
    var d = await resp1.json();
    notifyUpdate(d, resp1.headers);
    return d;
  }
  if (resp1.status !== 402) throw new Error('Server error ' + resp1.status + ': ' + (await resp1.text()).substring(0, 200));

  // Step 2: parse payment requirements
  var payReq = null;
  var prHeader = resp1.headers.get('payment-required');
  if (prHeader) {
    try { var arr = JSON.parse(Buffer.from(prHeader, 'base64').toString('utf8')); if (arr && arr[0]) payReq = arr[0]; } catch(_e) {}
  }
  if (!payReq) {
    var body402 = await resp1.json();
    if (body402 && body402.accepts && body402.accepts[0]) payReq = body402.accepts[0];
  }
  if (!payReq) throw new Error('No payment requirements in 402');

  var amount = parseInt(payReq.maxAmountRequired || payReq.amount || '10000');
  console.error('[cryptoiz-mcp] Paying ' + (amount/1000000).toFixed(4) + ' USDC for ' + toolName);

  // Step 3: V1 direct transfer (simple, reliable)
  var sig = await sendUSDC(amount, toolName);
  var v1Header = Buffer.from(JSON.stringify({ signature: sig })).toString('base64');

  // Step 4: submit payment
  var resp2 = await fetch(url, { headers: clientHeaders({ 'x-payment': v1Header }) });
  if (resp2.status !== 200) throw new Error('Payment failed ' + resp2.status + ': ' + (await resp2.text()).substring(0, 300));

  var data = await resp2.json();
  notifyUpdate(data, resp2.headers);
  return data;
}

var TOOLS = [
  { name: 'get_whale_alpha', description: 'Alpha scanner - early accumulation tokens on Solana DEX. Cost: $0.05 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_whale_divergence', description: 'Whale divergence signals. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: { timeframe: { type: 'string', enum: ['4h', '1d'] } }, additionalProperties: false } },
  { name: 'get_whale_accumulation', description: 'Tokens in accumulation phase. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_whale_neutral', description: 'Tokens in neutral phase. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_whale_distribution', description: 'Tokens in distribution phase. Cost: $0.02 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_btc_regime', description: 'BTC macro regime. Cost: $0.01 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_btc_futures_signal', description: 'BTC futures signal. Cost: $0.03 USDC', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_token_ca', description: 'Get contract address by token name. FREE', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } },
  { name: 'get_status', description: 'CryptoIZ MCP server status. FREE', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
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
  console.error('[cryptoiz-mcp] ' + VERSION + ' running (V1 direct transfer + memo)');
}
main().catch(console.error);
