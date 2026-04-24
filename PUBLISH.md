# Publish Instructions

## Via GitHub Actions (recommended)
1. Add NPM_TOKEN secret to repo: Settings -> Secrets and variables -> Actions
2. Push tag v4.16.0 (already done)
3. Workflow auto-publishes

## Manual via CLI
```bash
npm login
npm publish --access public
```

Current version: 4.16.0
