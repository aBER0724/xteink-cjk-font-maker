# Task 3 red/green audit

Test:
- `convertFontToBin > packs xbf2 output with font metrics and glyph metrics when requested`
- File: `tests/unit/converter.test.ts`

Red:
- Temporary wrong implementation: in `worker/src/converter.ts`, force `const data = out;` so `outputFormat: "xbf2"` no longer wraps XBF2 output.
- Command: `cd "/Users/aber/Code/xteink-cjk-font-maker/.worktrees/dockerize-remove-cf" && npm exec vitest run tests/unit/converter.test.ts`
- Result: the whole `tests/unit/converter.test.ts` file ran and failed; the key target test `convertFontToBin > packs xbf2 output with font metrics and glyph metrics when requested` failed first with `expected '\u0000\u0000\u0000\u0000' to be 'XBF2'`.

Green:
- Restored correct implementation in `worker/src/converter.ts` to call `wrapBitmapFontAsXbf2(...)` for `outputFormat === "xbf2"`.
- Command: `cd "/Users/aber/Code/xteink-cjk-font-maker/.worktrees/dockerize-remove-cf" && npm exec vitest run tests/unit/converter.test.ts`
- Result: passed; `tests/unit/converter.test.ts (9 tests)` and `9 passed`.
