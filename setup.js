'use strict';
var VERSION = 'v4.16.7';
var fs = require('fs');
var os = require('os');
var path = require('path');

var privKey = process.argv[2];
if (!privKey) {
  console.log('Usage: npx cryptoiz-mcp-setup YOUR_SOLANA_PRIVATE_KEY');
  process.exit(1);
}

var config = {
  mcpServers: {
    cryptoiz: {
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: [require.resolve('./index.js')],
      env: { SVM_PRIVATE_KEY: privKey }
    }
  }
};

var configPaths = [
  path.join(process.env.LOCALAPPDATA || '', 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'),
  path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
  path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
];

var written = false;
for (var i = 0; i < configPaths.length; i++) {
  var p = configPaths[i];
  try {
    var dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    var existing = {};
    if (fs.existsSync(p)) {
      try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch(_e) {}
    }
    existing.mcpServers = existing.mcpServers || {};
    existing.mcpServers.cryptoiz = config.mcpServers.cryptoiz;
    fs.writeFileSync(p, JSON.stringify(existing, null, 2), 'utf8');
    console.log('Config written to: ' + p);
    written = true;
  } catch(_e) {}
}

if (written) {
  console.log('Done! Restart Claude Desktop to activate CryptoIZ MCP.');
} else {
  console.log('Could not write config. Please manually add config to Claude Desktop settings.');
}
