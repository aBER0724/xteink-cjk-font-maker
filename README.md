# xteink-cjk-font-maker

Web application for browsing published CrossPoint CJK fonts and generating the current `.cpfont v4` SD-card font package from a private `TTF/OTF` upload.

[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md)

![Application screenshot](docs/xteink-home.png)

## Current format

The primary conversion flow invokes the canonical Python/FreeType converter from [`aBER0724/crosspoint-cjk-fonts`](https://github.com/aBER0724/crosspoint-cjk-fonts). It produces a deterministic ZIP containing physical `.cpfont v4` files at:

```text
8 / 10 / 12 / 14 / 16 / 18 / 22 pt
```

The package also includes `SHA256SUMS` and `build.json` provenance. The device selects a physical file and does not scale CJK fonts at runtime.

The previous `legacy-bin` and experimental `xbf2` converters remain under **Legacy Tools**. They are not the current SD-card catalog format.

## Font Library

The native React catalog reads:

```text
https://aber0724.github.io/crosspoint-cjk-fonts/catalog.json
```

It displays real `.cpfont` bitmap previews and links directly to the versioned GitHub Release. It does not proxy or re-host public font binaries. A catalog outage does not disable private conversion.

## Features

- Browse, search, preview, and download verified public families
- Upload private `TTF/OTF` files up to 20 MiB
- Generate `.cpfont v4` at seven physical sizes with optional FreeType auto-hinting
- Download a ZIP with checksums and build provenance
- Keep `legacy-bin` and experimental `xbf2` compatibility tools
- Async jobs, conversion history, multilingual UI, and PWA support

## Project layout

- Node server: `server/index.ts`
- API and job consumer: `worker/src/api.ts`, `worker/src/consumer.ts`
- Canonical converter adapter: `worker/src/cpfont/`
- React web app: `web/`
- Production image: `Dockerfile`
- Operations: `docs/ops/limits.md`

## Local development

Requirements:

- Node.js 22
- npm
- Python 3.11
- sibling checkout `../crosspoint-cjk-fonts`, or `CPFONT_TOOL_ROOT`

Prepare the canonical toolkit once:

```bash
cd ../crosspoint-cjk-fonts
python -m pip install -r requirements.txt
python scripts/fetch_fallback.py
cd ../crosspoint-cjk-font-maker
```

Install and verify Font Maker:

```bash
npm ci
npm test
npm run build
npm run dev
```

Endpoints:

- Node API: `http://127.0.0.1:3000`
- Vite app: `http://127.0.0.1:5173`
- Capability check: `http://127.0.0.1:3000/api/capabilities`

Optional variables:

- `CPFONT_TOOL_ROOT`: canonical toolkit checkout
- `CPFONT_PYTHON`: Python executable with pinned toolkit dependencies
- `VITE_API_PROXY_TARGET`: local API proxy target
- `VITE_FONT_CATALOG_PAGE_URL`: standalone catalog page opened by the Font Library link

The browser upload preview uses the source font and is approximate. The Font Library opens the separately deployed catalog, so catalog UI updates do not require rebuilding or redeploying the Maker image.

## Docker

```bash
docker compose up --build
```

The production image uses Debian, Python virtualenv, the SHA-256-locked fallback, and a pinned `crosspoint-cjk-fonts` commit. Updating the toolchain pin is an explicit reviewed change.

For the Vite + API development stack:

```bash
docker compose -f docker-compose.dev.yml up --build
```

## Verification

```bash
npm test
npm run build
docker build -t crosspoint-cjk-font-maker .
```

CI also starts the production image and requires `/api/capabilities` to report `.cpfont` version 4 and all seven sizes.
