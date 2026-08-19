# Operational Limits

## Current request limits

- Upload size: `20 MiB`
- Jobs per IP per day: `10`
- Input extensions: `.ttf`, `.otf`

These request limits are defined by `worker/src/limits.ts` and are also shown before file submission in the web UI.

## `.cpfont v4` conversion limits

- Physical sizes: `8 / 10 / 12 / 14 / 16 / 18 / 22 pt`
- Unicode policy: `latin-ext,cjk`
- Conversion timeout: `15 minutes`
- Retained converter stderr: `64 KiB`
- Maximum generated `.cpfont` file: `50 MiB`
- Maximum uncompressed family output: `350 MiB`
- Output styles in the initial workflow: regular only

The converter process is launched without a shell in an isolated temporary directory. Generated output is accepted only after binary version, section-boundary, bitmap-range, size-set, and package-limit validation. Temporary source and generated files are removed after packaging or failure.

## API behavior

`GET /api/capabilities` reports whether the canonical `.cpfont v4` toolchain, version 4 converter, and locked Latin fallback are available. Public responses never contain local filesystem paths.

Stable setup/conversion errors include:

- `ERR_CPFONT_TOOL_MISSING`
- `ERR_CPFONT_TOOL_VERSION`
- `ERR_CPFONT_FALLBACK_MISSING`
- `ERR_INVALID_FAMILY_NAME`
- `ERR_CPFONT_PROCESS_START`
- `ERR_CPFONT_TIMEOUT`
- `ERR_CPFONT_CONVERTER`
- `ERR_CPFONT_OUTPUT_INVALID`

The production Docker image pins the canonical font repository commit. A local non-Docker setup may use the sibling checkout or `CPFONT_TOOL_ROOT`, and its exact commit is recorded in `build.json`.

## Public catalog

The Font Library fetches `catalog.json` directly from GitHub Pages and downloads fonts directly from GitHub Release. Public font traffic does not pass through the Font Maker server. A catalog error is isolated from the private conversion route.

## Recommended monitoring

- Upload rejection ratio
- Conversion duration by phase
- Timeout and converter failure rates
- Output size distribution
- Temporary-directory cleanup failures
- Per-IP job distribution
- Public catalog fetch error rate
