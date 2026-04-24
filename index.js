#!/usr/bin/env node
// CryptoIZ MCP Server v4.15.15
// Whale Intelligence Suite: 6 paid tools + 2 free
// x402 V2: Dexter facilitator (gas sponsored) + V1 backward compat
// ZERO template literals — Windows PowerShell safe

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import bs58 from 'bs58';

var VERSION = 'v4.15.15';
var GATEWAY = 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-x402-gateway';
// Per-tool endpoints for Dexter settlement naming
var TOOL_ENDPOINTS = {
  get_whale_alpha: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-alpha-scanner',
  get_whale_divergence: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-divergence',
  get_whale_accumulation: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-accumulation',
  get_whale_neutral: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-neutral',
  get_whale_distribution: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-distribution',
  get_btc_regime: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-btc-regime',
  // Backward compat: old names -> same proxy endpoints
  get_alpha_scanner: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-alpha-scanner',
  get_divergence: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-divergence',
  get_accumulation: 'https://rehqwsypjnjirhuiapqh.supabase.co/functions/v1/mcp-accumulation',
};
var RECIPIENT = 'DsKmdkYx49Xc1WhqMUAztwhdYPTqieyC98VmnnJdgpXX';
var USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
var DEXTER_FEE_PAYER = 'DEXVS3su4dZQWTvvPnLDJLRK1CeeKG6K3QqdzthgAkNV';
var SOL_RPC = 'https://api.mainnet-beta.solana.com';
var TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
var ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
var DEV_KEY = process.env.CRYPTOIZ_DEV_KEY || '';

function getKeypair() {
  var privKey = process.env.SVM_PRIVATE_KEY;
  if (!privKey) throw new Error('SVM_PRIVATE_KEY env var not set');
  try {
    var decoded = bs58.decode(privKey);
    return Keypair.fromSecretKey(decoded);
  } catch(e) {
    throw new Error('Invalid SVM_PRIVATE_KEY: ' + e.message);
  }
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

// ===== V2: Build partially-signed tx for Dexter facilitator =====
var COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
var MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

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
  setLimitData.writeUInt8(2, 0);
  setLimitData.writeUInt32LE(20000, 1);
  var setLimitIx = { programId: computeBudgetPk, keys: [], data: setLimitData };

  var setPriceData = Buffer.alloc(9);
  setPriceData.writeUInt8(3, 0);
  setPriceData.writeUInt32LE(1, 1);
  setPriceData.writeUInt32LE(0, 5);
  var setPriceIx = { programId: computeBudgetPk, keys: [], data: setPriceData };

  var transferKeys = [
    { pubkey: userATA, isSigner: false, isWritable: true },
    { pubkey: usdcMintPk, isSigner: false, isWritable: false },
    { pubkey: recipientATA, isSigner: false, isWritable: true },
    { pubkey: kp.publicKey, isSigner: true, isWritable: false },
  ];
  var transferData = Buffer.alloc(10);
  transferData.writeUInt8(12, 0);
  var lo = amount & 0xFFFFFFFF;
  var hi = Math.floor(amount / 0x100000000) & 0xFFFFFFFF;
  transferData.writeUInt32LE(lo, 1);
  transferData.writeUInt32LE(hi, 5);
  transferData.writeUInt8(6, 9);
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

// ===== V1 FALLBACK: Send USDC on-chain, return signature =====
async function sendUSDC(amount) {
  var kp = getKeypair();
  var conn = new Connection(SOL_RPC, 'confirmed');

  var userATA = findATA(kp.publicKey.toBase58(), USDC_MINT);
  var recipientATA = findATA(RECIPIENT, USDC_MINT);

  var tokenProgramPk = new PublicKey(TOKEN_PROGRAM);
  var keys = [
    { pubkey: userATA, isSigner: false, isWritable: true },
    { pubkey: recipientATA, isSigner: false, isWritable: true },
    { pubkey: kp.publicKey, isSigner: true, isWritable: false },
  ];

  var data = Buffer.alloc(9);
  data.writeUInt8(3, 0);
  var lo = amount & 0xFFFFFFFF;
  var hi = Math.floor(amount / 0x100000000) & 0xFFFFFFFF;
  data.writeUInt32LE(lo, 1);
  data.writeUInt32LE(hi, 5);

  var transferIx = {
    programId: tokenProgramPk,
    keys: keys,
    data: data,
  };

  var bhResult = await conn.getLatestBlockhash('confirmed');
  var tx = new Transaction({
    feePayer: kp.publicKey,
    blockhash: bhResult.blockhash,
    lastValidBlockHeight: bhResult.lastValidBlockHeight,
  });
  tx.add(transferIx);
  tx.sign(kp);

  var rawTx = tx.serialize();
  var sig = await conn.sendRawTransaction(rawTx, { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash: bhResult.blockhash, lastValidBlockHeight: bhResult.lastValidBlockHeight }, 'confirmed');
  return sig;
}

// ===== TOOL CALL HANDLER =====
async function callTool(toolName, args) {
  var queryParts = [];

  // Use per-tool endpoint if available, otherwise gateway
  var baseUrl = TOOL_ENDPOINTS[toolName] || GATEWAY;

  if (!TOOL_ENDPOINTS[toolName]) {
    // Free tools go to gateway with tool param
    queryParts.push('tool=' + toolName);
  }

  // Handle timeframe for divergence tools (new and old name)
  if ((toolName === 'get_whale_divergence' || toolName === 'get_divergence') && args && args.timeframe) {
    queryParts.push('tf=' + args.timeframe);
  }
  if ((toolName === 'get_token_ca') && args && args.name) {
    queryParts.push('name=' + encodeURIComponent(args.name));
  }

  var url = queryParts.length > 0 ? baseUrl + '?' + queryParts.join('&') : baseUrl;

  // Dev mode bypass
  if (DEV_KEY) {
    var devResp = await fetch(url, { headers: { 'x-dev-key': DEV_KEY } });
    var devData = await devResp.json();
    return devData;
  }

  // Step 1: Fetch gateway — expect 402 or 200 (free tools)
  var resp1 = await fetch(url);

  if (resp1.status === 200) {
    return await resp1.json();
  }

  if (resp1.status !== 402) {
    var errText = await resp1.text();
    throw new Error('Gateway error ' + resp1.status + ': ' + errText);
  }

  // Step 2: Parse 402 response — try V2 header first, fallback to body
  var paymentRequirements = null;
  var useV2 = false;

  var prHeader = resp1.headers.get('payment-required');
  if (prHeader) {
    try {
      var prDecoded = Buffer.from(prHeader, 'base64').toString('utf8');
      var prArray = JSON.parse(prDecoded);
      if (Array.isArray(prArray) && prArray.length > 0) {
        paymentRequirements = prArray[0];
        useV2 = true;
      }
    } catch(e) {
      console.error('[cryptoiz-mcp] Failed to parse PAYMENT-REQUIRED header:', e.message);
    }
  }

  // Fallback: read from body (V1 compat)
  if (!paymentRequirements) {
    var body402 = await resp1.json();
    if (body402.accepts && body402.accepts.length > 0) {
      paymentRequirements = body402.accepts[0];
    } else {
      throw new Error('402 response missing payment requirements');
    }
  }

  var amount = parseInt(paymentRequirements.maxAmountRequired || paymentRequirements.amount || '10000');
  var displayAmount = (amount / 1000000).toFixed(4);
  var hasFeePayer = paymentRequirements.extra && paymentRequirements.extra.feePayer;
  console.error('[cryptoiz-mcp] Payment required: ' + displayAmount + ' USDC for ' + toolName + (hasFeePayer ? ' (V2 Dexter)' : ' (V1 self-pay)'));

  // Step 3: Build and send payment
  var paymentHeader = '';
  var headerName = '';

  if (useV2 && paymentRequirements.extra && paymentRequirements.extra.feePayer) {
    var v2FeePayer = paymentRequirements.extra.feePayer;
    console.error('[cryptoiz-mcp] V2 mode: 4-ix tx (Limit+Price+TransferChecked+Memo), feePayer=' + v2FeePayer.substring(0, 8) + '...');
    try {
      var txB64 = await buildV2PaymentPayload(amount, v2FeePayer);

      var v2Payload = {
        x402Version: 2,
        accepted: {
          scheme: paymentRequirements.scheme || 'exact',
          network: paymentRequirements.network || 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        },
        payload: {
          transaction: txB64,
        },
      };

      paymentHeader = Buffer.from(JSON.stringify(v2Payload)).toString('base64');
      headerName = 'payment-signature';
      console.error('[cryptoiz-mcp] V2 tx ready, sending via payment-signature header');
    } catch(e) {
      console.error('[cryptoiz-mcp] V2 build failed: ' + e.message + ', falling back to V1');
      useV2 = false;
    }
  } else {
    useV2 = false;
  }

  if (!useV2) {
    console.error('[cryptoiz-mcp] V1 mode: sending USDC on-chain...');
    var sig = await sendUSDC(amount);
    console.error('[cryptoiz-mcp] V1 TX confirmed: ' + sig);

    var v1Payload = { signature: sig };
    paymentHeader = Buffer.from(JSON.stringify(v1Payload)).toString('base64');
    headerName = 'x-payment';
  }

  // Step 4: Retry with payment header
  var headers2 = {};
  headers2[headerName] = paymentHeader;

  var resp2 = await fetch(url, { headers: headers2 });

  // V2 settle failed? Auto-fallback to V1
  if (resp2.status !== 200 && useV2) {
    var v2ErrBody = await resp2.text();
    console.error('[cryptoiz-mcp] V2 settle failed (' + resp2.status + '): ' + v2ErrBody.substring(0, 200));
    console.error('[cryptoiz-mcp] Auto-fallback to V1 (sendUSDC on-chain)...');
    
    try {
      var fallbackSig = await sendUSDC(amount);
      console.error('[cryptoiz-mcp] V1 fallback TX confirmed: ' + fallbackSig);
      
      var v1FallbackPayload = { signature: fallbackSig };
      var v1FallbackHeader = Buffer.from(JSON.stringify(v1FallbackPayload)).toString('base64');
      
      resp2 = await fetch(url, { headers: { 'x-payment': v1FallbackHeader } });
    } catch(fallbackErr) {
      console.error('[cryptoiz-mcp] V1 fallback also failed: ' + fallbackErr.message);
      throw new Error('V2 failed (' + v2ErrBody.substring(0, 100) + '), V1 fallback also failed: ' + fallbackErr.message);
    }
  }

  if (resp2.status !== 200) {
    var errBody = await resp2.text();
    throw new Error('Payment failed (' + resp2.status + '): ' + errBody);
  }

  var receipt = resp2.headers.get('payment-response') || resp2.headers.get('x-payment-response');
  if (receipt) {
    try {
      var receiptData = JSON.parse(Buffer.from(receipt, 'base64').toString('utf8'));
      console.error('[cryptoiz-mcp] Payment receipt: TX=' + (receiptData.transaction || 'n/a') + ' via ' + (receiptData.version || 'unknown'));
    } catch(e) {
      // ignore receipt parse errors
    }
  }

  var data = await resp2.json();
  return data;
}

// ===== MCP SERVER SETUP =====
var TOOLS = [
  {
    name: 'get_whale_alpha',
    description: 'Get top 20 smart money alpha signals from CryptoIZ Solana DEX scanner. Shows whale/dolphin accumulation patterns, entry timing, and risk scores. Cost: $0.05 USDC.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_whale_divergence',
    description: 'Get divergence signals - hidden accumulation, breakout accumulation, classic divergence between price and whale activity. Cost: $0.02 USDC.',
    inputSchema: {
      type: 'object',
      properties: {
        timeframe: { type: 'string', description: 'Timeframe: 4h (default) or 1d', enum: ['4h', '1d'] },
      },
      required: [],
    },
  },
  {
    name: 'get_whale_accumulation',
    description: 'Get tokens in accumulation phase with holder tier analysis (whale/dolphin/shrimp deltas). Smart money is entering these tokens. Cost: $0.02 USDC.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_whale_neutral',
    description: 'Get tokens in neutral phase - no clear accumulation or distribution. Watch for phase transitions. Cost: $0.02 USDC.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_whale_distribution',
    description: 'Get tokens in distribution phase - whale selling detected. Smart money is exiting. Consider closing positions or avoiding. Cost: $0.02 USDC.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_btc_regime',
    description: 'Get Bitcoin macro regime, fear/greed index, futures signals, and technicals (RSI, EMA, MACD). Cost: $0.01 USDC.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_token_ca',
    description: 'Look up a Solana token contract address by name. FREE - no payment required.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Token name to search for' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_status',
    description: 'Check CryptoIZ MCP server status, available tools, and pricing. FREE.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

var server = new Server(
  { name: 'cryptoiz-mcp', version: VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async function() {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async function(request) {
  var toolName = request.params.name;
  var args = request.params.arguments || {};

  try {
    var result = await callTool(toolName, args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch(e) {
    return {
      content: [{ type: 'text', text: 'Error: ' + e.message }],
      isError: true,
    };
  }
});

async function main() {
  var transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[cryptoiz-mcp] ' + VERSION + ' running on stdio (x402 V2 Dexter + V1 compat)');
}

main().catch(function(e) {
  console.error('[cryptoiz-mcp] Fatal:', e.message);
  process.exit(1);
});
