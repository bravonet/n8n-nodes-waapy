# Purpose
This repository contains a TypeScript-based n8n community node package for Waapy (`Waapy` action node, `Waapy Trigger` node, and `waapyApi` credentials). Source code lives in `nodes/` and `credentials/`; build artifacts are generated into `dist/`.

# Quick Commands
```bash
# Install/setup
npm ci

# Build (compile TypeScript and generate dist/)
npm run build

# Dev/watch
npm run dev
npm run build:watch

# Lint / auto-fix
npm run lint
npm run lint:fix

# Local integration smoke test (manual in n8n UI)
docker-compose up --build
```

```bash
# Test (placeholder)
# No test script/config found. Searched package.json scripts and repo patterns:
# *.test.*, *.spec.*, and __tests__ directories.
# Add a script first, then use:
npm run test

# Typecheck (placeholder for a dedicated script)
# No "typecheck" script found in package.json.
# Current practical command:
npx tsc --noEmit
```

# Code Style & Patterns
- Language/framework: TypeScript + n8n node APIs (`n8n-workflow`, `@n8n/node-cli`).
- Keep source of truth in `nodes/**` and `credentials/**`; treat `dist/**` as generated output.
- Follow strict TypeScript settings from `tsconfig.json` (`strict`, `noImplicitAny`, `strictNullChecks`, etc.).
- Match existing formatting conventions in source files (tabs, single quotes, trailing commas where used).
- For HTTP calls in nodes, use `this.helpers.httpRequest(...)` and wrap failures with `NodeApiError`/`NodeOperationError`.
- Keep each node's `.node.ts` and `.node.json` metadata aligned.

# Workflow Rules
- No repo-specific branch naming, PR template, or CI workflow files were found (`.github/**`, `CONTRIBUTING*`, `CODEOWNERS` absent).
- Keep PRs focused and include the exact verification commands run.
- If adding new scripts (test/typecheck/format), wire them through `package.json` so automation can rely on stable commands.

# Guardrails
- Do not manually edit generated files in `dist/` (including `dist/tsconfig.tsbuildinfo`); regenerate via `npm run build`.
- Do not edit `node_modules/`.
- Never commit real Waapy credentials (API keys, private endpoints, or secret webhook URLs).
- Be careful when changing credential field names in `credentials/WaapyApi.credentials.ts`; they are referenced in node code (`$credentials[...]`).
- Treat `docker-compose.yml` environment values as local-dev defaults unless a task explicitly requests runtime config changes.

# How To Verify Changes
- Changes in `nodes/**` or `credentials/**`:
  - `npm run lint`
  - `npm run build`
- Behavior changes for webhook/trigger flow:
  - `docker-compose up --build`
  - In local n8n (`http://localhost:5678`), activate `Waapy Trigger` and confirm webhook create/delete and payload handling.
- Metadata/documentation changes in node definitions (`*.node.json`):
  - `npm run build`
  - Confirm corresponding generated files appear under `dist/nodes/...`.
- Test coverage note:
  - No automated unit/integration test harness is currently configured; rely on lint + build + local n8n smoke validation.
