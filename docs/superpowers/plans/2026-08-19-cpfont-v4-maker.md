# `.cpfont v4` Font Maker Implementation Plan

> Execute in `C:/Users/aBER/Documents/Code/crosspoint-cjk-font-maker-cpfont` on `feat/cpfont-v4-maker`. Start after the public catalog schema and parser are stable. Use test-first changes and commit after each green task.

## Task 1: Repair concurrent filesystem state writes

**Files**
- Create `tests/unit/storage.test.ts`
- Modify `worker/src/storage.ts`

**Steps**
1. Add a failing test that freezes `Date.now()`, performs concurrent writes to one job, and asserts all writes settle, the final JSON is complete, and no temp files remain.
2. Add a unique random suffix to each temp path; if Windows replacement still races, serialize writes per destination path with a promise chain.
3. Run the storage test and the existing integration suite.
4. Commit: `fix: serialize atomic job state writes`.

## Task 2: Add `.cpfont v4` job types and capability detection

**Files**
- Modify `worker/src/api.ts`
- Modify `worker/src/consumer.ts`
- Modify `worker/src/file-name.ts`
- Create `worker/src/cpfont/types.ts`
- Create `worker/src/cpfont/toolkit.ts`
- Modify `server/index.ts`
- Add/modify integration tests

**Steps**
1. Add failing API tests for explicit `cpfont-v4`, family-name validation, historical omitted-format behavior, and `/api/capabilities`.
2. Add the output-format literal, cpfont request fields, safe normalized names, toolkit discovery order, and public reason codes without filesystem leakage.
3. Run focused API/server tests.
4. Commit: `feat: expose cpfont v4 job capabilities`.

## Task 3: Implement safe Python runner and output validation

**Files**
- Create `worker/src/cpfont/runner.ts`
- Create `worker/src/cpfont/validator.ts`
- Create `worker/src/cpfont/provenance.ts`
- Create `tests/unit/cpfont-runner.test.ts`
- Create `tests/unit/cpfont-validator.test.ts`

**Steps**
1. Add failing tests for array-based spawn without a shell, exact canonical arguments, timeout/kill, capped stderr, cleanup, seven expected files, v4 header/TOC bounds, and size limits.
2. Implement isolated temp directories and `finally` cleanup.
3. Validate exactly `8/10/12/14/16/18/22`, regular style, and safe file boundaries before packaging.
4. Record source/fallback hashes, toolkit commit, Python/dependency versions, and output hashes.
5. Run focused tests.
6. Commit: `feat: run canonical cpfont converter`.

## Task 4: Deterministic ZIP packaging and consumer integration

**Files**
- Create `worker/src/cpfont/package.ts`
- Modify `worker/src/consumer.ts`
- Modify `worker/src/storage.ts` if MIME metadata requires it
- Modify consumer/integration tests

**Steps**
1. Add failing tests for deterministic entry order/timestamps/permissions, `SHA256SUMS`, `build.json`, output name, cleanup, and coarse phases.
2. Integrate runner selection while preserving legacy conversion behavior.
3. Store ZIP output with `application/zip` and return `<Family>_cpfont-v4.zip`.
4. Run consumer and API integration tests.
5. Commit: `feat: package seven-size cpfont families`.

## Task 5: Production Docker toolkit

**Files**
- Modify `Dockerfile`
- Modify `docker-compose.yml`
- Modify `.github/workflows/ci.yml`
- Add a Docker/capability smoke test or script

**Steps**
1. Pin the approved `crosspoint-cjk-fonts` commit as a build argument.
2. Move the production image to a compatible Debian Node base, install Python virtual environment requirements, fetch the locked fallback, and verify cpfont version 4 at build time.
3. Add a CI image build and `/api/capabilities` smoke check.
4. Commit: `build: bundle pinned cpfont toolchain`.

## Task 6: Primary `.cpfont` UI and legacy tools split

**Files**
- Modify `web/src/App.jsx`
- Modify `web/app.js`
- Modify `web/src/index.css`
- Modify e2e/unit UI tests

**Steps**
1. Add failing tests for current/legacy navigation, default `cpfont-v4`, seven physical sizes, metadata-derived editable family name, 20 MiB preflight, auto-hint control, coarse phases, and legacy regression behavior.
2. Implement `Font Library | Make .cpfont | Legacy Tools` navigation.
3. Label the existing source-font canvas as approximate and keep old controls in Legacy Tools.
4. Preserve locale/theme/history/PWA behavior.
5. Run focused UI tests and `npm run build`.
6. Commit: `feat: make cpfont v4 the primary workflow`.

## Task 7: Public Font Library

**Files**
- Create a focused catalog client/component under `web/src/`
- Modify `web/src/App.jsx`
- Modify `web/src/index.css`
- Add catalog unit/e2e tests

**Steps**
1. Add failing tests for schema validation, HTTPS URL validation, search/filter/size selection, direct downloads, retry, and external-page fallback.
2. Read `VITE_FONT_CATALOG_URL` and `VITE_FONT_CATALOG_PAGE_URL` with production defaults.
3. Render catalog records with native React components; do not iframe or proxy Release assets.
4. Ensure catalog failure never disables conversion.
5. Commit: `feat: add public font library`.

## Task 8: Documentation and verification

**Files**
- Update `README.md`
- Update `README.zh.md`
- Update `README.ja.md`
- Update `docs/ops/limits.md`

**Steps**
1. Document primary `.cpfont v4`, seven sizes, local toolkit setup, Docker pin, legacy formats, catalog URLs, limits, and preview semantics.
2. Run `npm test`, `npm run build`, Docker build/capability smoke, and `git diff --check`.
3. Commit: `docs: document cpfont v4 workflow`.

## Task 9: Integration

1. Review branch diff and commits.
2. Push `feat/cpfont-v4-maker`.
3. Merge only after Font Maker CI and Docker capability smoke are green.
4. Verify one real small-font conversion locally and one full CJK conversion in production-sized infrastructure before declaring the service ready.
