# xteink-cjk-font-maker

CrossPoint の公開 CJK フォントを閲覧し、非公開の `TTF/OTF` からインストール可能な `.cpfontpkg` フォントファミリーパッケージを生成する Web アプリです。

[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md)

![アプリ画面](docs/xteink-home.png)

## 現在の正式形式

既定の変換は [`aBER0724/crosspoint-cjk-fonts`](https://github.com/aBER0724/crosspoint-cjk-fonts) の標準 Python/FreeType コンバーターを呼び出し、次の物理サイズを含む決定的な ZIP を生成します。

```text
8 / 10 / 12 / 14 / 16 / 18 / 22 pt
```

`SHA256SUMS` と `build.json` も含まれます。端末は実在する物理ファイルを選択し、CJK フォントを実行時に拡大縮小しません。

従来の `legacy-bin` と実験的な `xbf2` は **旧形式ツール** に残しますが、現在の SD カードカタログ形式ではありません。

## フォントライブラリ

React のライブラリは次を直接読み込みます。

```text
https://aber0724.github.io/crosspoint-cjk-fonts/catalog.json
```

実際の `.cpfont` ビットマップから作られたプレビューと、バージョン付き GitHub Release への直接リンクを表示します。Font Maker サーバーは公開フォント本体を中継しません。カタログ障害時も非公開フォント変換は利用できます。

## 機能

- 公開フォントの検索、プレビュー、ダウンロード
- 20 MiB 以下の非公開 `TTF/OTF` アップロード
- 7 物理サイズの `.cpfont v4` と任意の FreeType 自動ヒンティング
- ハッシュとビルド来歴を含む ZIP
- `legacy-bin` / 実験的 `xbf2` の互換ツール
- 非同期ジョブ、変換履歴、多言語 UI、PWA

## ローカル開発

必要条件：

- Node.js 22
- npm
- Python 3.11
- 同階層の `../crosspoint-cjk-fonts`、または `CPFONT_TOOL_ROOT`

標準ツールチェーンを一度準備します。

```bash
cd ../crosspoint-cjk-fonts
python -m pip install -r requirements.txt
python scripts/fetch_fallback.py
cd ../crosspoint-cjk-font-maker
```

```bash
npm ci
npm test
npm run build
npm run dev
```

- Node API：`http://127.0.0.1:3000`
- Vite：`http://127.0.0.1:5173`
- 能力確認：`http://127.0.0.1:3000/api/capabilities`

環境変数：`CPFONT_TOOL_ROOT`、`CPFONT_PYTHON`、`VITE_API_PROXY_TARGET`、`VITE_FONT_CATALOG_PAGE_URL`。

アップロード画面の端末プレビューは元フォントをブラウザーで近似表示したもので、最終 `.cpfont` ではありません。「フォントライブラリ」は独立デプロイされたカタログを開くため、カタログ UI の更新時に Maker イメージを再ビルド・再デプロイする必要はありません。

## Docker

```bash
docker compose up --build
```

本番イメージは Debian、Python venv、SHA-256 固定 fallback、固定 `crosspoint-cjk-fonts` commit を使用します。ツールチェーン更新は明示的なレビュー対象です。

開発構成：

```bash
docker compose -f docker-compose.dev.yml up --build
```

## 検証

```bash
npm test
npm run build
docker build -t crosspoint-cjk-font-maker .
```

CI は本番イメージを起動し、`/api/capabilities` が `.cpfont` v4 と 7 サイズを返すことも確認します。
