# AGENTS.md
Guidance for agentic coding assistants working in `xteink-cjk-font-maker`.

## Scope
- Stack: Node server + Vite/React web UI.
- Languages: TypeScript (`server/`, `worker/`, `tests/`), JavaScript/JSX (`web/`).
- Package manager: npm (`package-lock.json` present).
- Module system: ESM (`"type": "module"`).

## Repository Layout
- `server/`: Node HTTP server entrypoint and runtime wiring.
- `worker/src/`: shared API routes, converter core, storage, background job helpers.
- `web/`: Vite app, Tailwind config, React UI.
- `tests/`: `unit`, `integration`, `e2e`, `smoke` test suites.
- `scripts/generate-charsets.mjs`: charset/codegen script.
- `charsets/`: generated charset text files.
- `docs/`: deployment/operations docs.

## Build / Test / Dev Commands

### Setup
```bash
npm install
```

### Test (Vitest)
```bash
# full suite
npm test
# single file
npm test -- tests/unit/limits.test.ts
# single test case (preferred for focused work)
npm test -- tests/unit/limits.test.ts -t "rejects files larger than configured max size"
# example: one integration suite
npm test -- tests/integration/api.test.ts
# example: one e2e logic suite
npm test -- tests/e2e/web-flow.test.ts
```

### Build / Run
```bash
# full production build
npm run build
# web production build only
npm run web:build
# preview production web build
npm run web:preview
# full-stack local dev (node + web)
npm run dev
# docker dev stack
docker compose -f docker-compose.dev.yml up --build
# docker production stack
docker compose up --build
```

### Data/Codegen
```bash
# regenerate charset text + worker charset data
npm run generate:charsets
```

## Lint / Format / Typecheck Reality
- No `lint` script exists in `package.json`.
- No `format` script exists in `package.json`.
- `tsconfig.json` is strict, but `npx tsc --noEmit` is currently not a clean gate.
- Practical verification baseline: `npm test` + `npm run build`.

## Code Style Guidelines
Follow existing style in edited files. Avoid broad, unrelated style churn.

### Imports
- Use ESM imports/exports only.
- Prefer ordering: external packages -> internal alias imports -> relative imports.
- In TS, use `import type` for type-only imports when practical.
- Keep local path conventions:
  - TS files usually use extensionless relative imports.
  - JS/JSX keeps explicit `.js` where already present.
- In web code, use the configured alias `@` for `web/src` where appropriate.

### Formatting
- 2-space indentation.
- Keep semicolons.
- Prefer double quotes in TS/JSX areas; preserve local style if a file differs.
- Use trailing commas in multiline literals/params where the file already does.

### Types and Contracts
- Keep TS strict-friendly where practical.
- Use explicit interfaces/types for request/response/job payloads.
- Use union literals for constrained values (tiers, statuses, error codes).
- Narrow unknown errors before access (`error instanceof Error`).
- Preserve boundary naming conventions:
  - External JSON/API fields: snake_case.
  - Internal variables/functions: camelCase.

### Naming
- `camelCase`: variables, functions, object members.
- `PascalCase`: interfaces, types, React components.
- `UPPER_SNAKE_CASE`: constants and tuning parameters.
- Helper filenames are typically kebab-case (e.g., `file-name.ts`).
- Tests use `*.test.ts` and mirror feature/domain names.

### Error Handling
- API handlers should return structured JSON errors with stable `ERR_*` codes and status.
- Use defensive input parsing and fallback defaults where needed.
- Fail fast for missing dependencies/resources.
- Convert thrown unknowns to safe messages at API/UI boundaries.
- For fetch wrappers, check `response.ok` and throw meaningful errors.

### Backend Patterns
- Keep conversion logic mostly pure (`converter.ts`).
- Keep storage and side effects isolated (`storage.ts`, API/consumer layers).
- Use small helper functions for reusable transforms/validation.
- Preserve existing UTF-8 filename handling in content-disposition.

### Frontend Patterns
- Functional React components with hooks.
- Keep form and UI state local unless sharing is clearly needed.
- Reuse existing primitives from `web/src/components/ui`.
- Preserve basic accessibility patterns already in code (labels, button types, ARIA states).

### Testing Patterns
- Use Vitest globals (`describe`, `it`, `expect`).
- Prefer focused regression tests before changing behavior.
