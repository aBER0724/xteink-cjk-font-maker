# xteink-cjk-font-maker

`crosspoint-reader-cjk` 互換の `.bin` ファイルを生成する Web フォントコンバーターです。

[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md)

![アプリ画面](docs/xteink-home.png)

## 機能

- `TTF/OTF` フォントファイルのアップロード
- 文字セット tier の選択：`6k` / `24k` / `65k`
- レンダリングパラメータの設定：`font_size_px`、`font_weight`、`output_width_px`、`output_height_px`
- 非同期変換フロー
- PWA 対応 Web UI

## プロジェクト構成

- Node サーバーエントリ：`server/index.ts`
- API ロジック：`worker/src/api.ts`
- バックグラウンド変換ヘルパー：`worker/src/consumer.ts`
- Web ソース：`web/`
- Web ビルド出力：`web/dist`
- Docker 本番イメージ：`Dockerfile`
- Docker 開発構成：`docker-compose.dev.yml`
- Docker 本番構成：`docker-compose.yml`

## 前提条件

- Node.js 20+
- npm
- Docker / Docker Compose（任意）

## ローカル開発

まず依存関係をインストールし、基本チェックを実行します：

```bash
npm install
npm test
npm run build
```

ローカルでフルスタックを起動：

```bash
npm run dev
```

起動内容：

- Node API：`http://127.0.0.1:3000`
- Vite Web：`http://127.0.0.1:5173`（`/api/*` をプロキシ）

### 任意のローカル変数

- `VITE_API_PROXY_TARGET`
  - `web/vite.config.mjs` で使用
  - 既定値：`http://127.0.0.1:3000`

## Docker 開発環境

```bash
docker compose -f docker-compose.dev.yml up --build
```

起動内容：

- Node API：`http://127.0.0.1:3000`
- Vite Web：`http://127.0.0.1:5273`

## Docker 本番環境

```bash
docker compose up --build
```

`http://127.0.0.1:3000` で本番 Node サーバーが起動し、`web/dist` からフロントエンド静的ファイルを配信します。

## PWA 対応

本番ビルド時にインストール可能な PWA をサポートします：

- Manifest：`web/public/manifest.webmanifest`
- Service Worker：`web/public/sw.js`
- Icons：`web/public/icon-192.png`、`web/public/icon-512.png`

ローカル確認：

```bash
npm run web:build
npm run web:preview
```

## 関連ドキュメント

- 運用上の制限：`docs/ops/limits.md`
