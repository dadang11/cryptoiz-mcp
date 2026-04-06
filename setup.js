#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

var VERSION = 'v4.15.12';
function print(msg) { process.stdout.write(msg + '\n'); }

function findConfigPath() {
  var p = os.platform(), candidates = [];
  if (p === 'darwin') {
    candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  } else if (p === 'win32') {
    // MSIX path FIRST (priority) — most Windows Claude Desktop installs are MSIX
    var localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    try {
      var packagesDir = path.join(localAppData, 'Packages');
      if (fs.existsSync(packagesDir)) {
        var dirs = fs.readdirSync(packagesDir);
        for (var i = 0; i < dirs.length; i++) {
          if (dirs[i].startsWith('Claude_')) {
            candidates.push(path.join(packagesDir, dirs[i], 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
          }
        }
      }
    } catch(e) {}
    // Standard path as fallback
    var appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    candidates.push(path.join(appdata, 'Claude', 'claude_desktop_config.json'));
  } else {
    candidates.push(path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json'));
  }
  for (var j = 0; j < candidates.length; j++) {
    if (fs.existsSync(candidates[j])) return candidates[j];
  }
  return candidates[0] || null;
}

function findPackagePath() {
  if (os.platform() !== 'win32') return null;
  var prefix = '';
  try { prefix = execSync('npm config get prefix', { encoding: 'utf8' }).trim(); } catch(e) {
    prefix = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm');
  }
  var c = [
    path.join(prefix, 'node_modules', 'cryptoiz-mcp', 'index.js'),
    path.join(prefix, 'lib', 'node_modules', 'cryptoiz-mcp', 'index.js'),
  ];
  for (var i = 0; i < c.length; i++) { if (fs.existsSync(c[i])) return c[i]; }
  return null;
}

function buildEntry(key) {
  if (os.platform() === 'win32') {
    var pkgPath = findPackagePath();
    if (!pkgPath) { print('ERROR: Run npm install -g cryptoiz-mcp first'); process.exit(1); }
    return { command: process.execPath, args: [pkgPath], env: { SVM_PRIVATE_KEY: key } };
  }
  return { command: 'npx', args: ['-y', 'cryptoiz-mcp@' + VERSION.replace('v','')], env: { SVM_PRIVATE_KEY: key } };
}

function injectConfig(cfgPath, entry) {
  var config = {};
  if (fs.existsSync(cfgPath)) {
    try { config = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch(e) {
      fs.copyFileSync(cfgPath, cfgPath + '.backup.' + Date.now());
      print('Config had error. Backup created.');
    }
  }
  if (!config.mcpServers) config.mcpServers = {};
  if (config.mcpServers.cryptoiz) print('Updating existing CryptoIZ entry...');
  config.mcpServers.cryptoiz = entry;
  var dir = path.dirname(cfgPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
}

// Get private key from command line argument
var key = (process.argv[2] || '').trim();

print('');
print('========================================');
print('  CryptoIZ MCP Installer ' + VERSION);
print('========================================');
print('OS: ' + os.platform() + ' ' + os.arch());

if (!key) {
  print('');
  print('Usage:');
  print('  npx cryptoiz-mcp-setup YOUR_PRIVATE_KEY');
  print('');
  print('Example:');
  print('  npx cryptoiz-mcp-setup 5MaiiCavjCmn9Hs1o...');
  print('');
  print('SECURITY:');
  print('- Use a DEDICATED wallet (not main wallet)');
  print('- Fund with $1-5 USDC only, no SOL needed');
  print('- Export: Phantom > Settings > Security > Export Private Key');
  print('');
  print('Guide: cryptoiz.org/McpLanding');
  process.exit(1);
}

// Validate base58
var chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
if (key.length < 40 || key.length > 100) { print('ERROR: Invalid key length (' + key.length + ' chars). Expected 44-88.'); process.exit(1); }
for (var i = 0; i < key.length; i++) {
  if (chars.indexOf(key[i]) === -1) { print('ERROR: Invalid base58 character at position ' + i + ': "' + key[i] + '"'); process.exit(1); }
}

var cfgPath = findConfigPath();
if (!cfgPath) { print('ERROR: Claude Desktop not found.'); process.exit(1); }
print('Config: ' + cfgPath);

if (os.platform() === 'win32') {
  print('[Windows] absolute paths mode');
  var pkg = findPackagePath();
  if (!pkg) { print('Run: npm install -g cryptoiz-mcp'); process.exit(1); }
  print('Node: ' + process.execPath);
  print('Package: ' + pkg);
}

injectConfig(cfgPath, buildEntry(key));

print('');
print('SETUP COMPLETE!');
print('Config: ' + cfgPath);
print('');
print('Next:');
print('1. Close Claude Desktop completely');
print('2. Reopen Claude Desktop');
print('3. Type: get_status');
print('');
print('Guide: cryptoiz.org/McpLanding');
print('');
