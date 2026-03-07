# xteink-cjk-font-maker

用于生成兼容 `crosspoint-reader-cjk` 的 `.bin` 文件的 Web 字体转换器。

[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md)

![应用截图](docs/xteink-home.png)

## 功能

- 上传 `TTF/OTF` 字体文件
- 选择字符集等级：`6k`、`24k`、`65k`
- 配置渲染参数：`font_size_px`、`font_weight`、`output_width_px`、`output_height_px`
- 异步转换流程
- 支持 PWA 的 Web UI

## 项目结构

- Node 服务入口：`server/index.ts`
- API 逻辑：`worker/src/api.ts`
- 后台转换辅助逻辑：`worker/src/consumer.ts`
- Web 源码：`web/`
- Web 构建产物：`web/dist`
- Docker 生产镜像：`Dockerfile`
- Docker 开发编排：`docker-compose.dev.yml`
- Docker 生产编排：`docker-compose.yml`

## 前置要求

- Node.js 20+
- npm
- Docker / Docker Compose（可选）

## 本地开发

先安装依赖并执行基础验证：

```bash
npm install
npm test
npm run build
```

启动本地全栈：

```bash
npm run dev
```

会启动：

- Node API：`http://127.0.0.1:3000`
- Vite Web：`http://127.0.0.1:5173`（带 `/api/*` 代理）

### 可选本地变量

- `VITE_API_PROXY_TARGET`
  - 由 `web/vite.config.mjs` 使用
  - 默认值：`http://127.0.0.1:3000`

## Docker 开发环境

```bash
docker compose -f docker-compose.dev.yml up --build
```

会启动：

- Node API：`http://127.0.0.1:3000`
- Vite Web：`http://127.0.0.1:5273`

## Docker 生产环境

```bash
docker compose up --build
```

会在 `http://127.0.0.1:3000` 启动生产 Node 服务，并从 `web/dist` 提供前端静态资源。

## PWA 支持

Web 应用在生产构建中支持可安装 PWA：

- Manifest：`web/public/manifest.webmanifest`
- Service Worker：`web/public/sw.js`
- Icons：`web/public/icon-192.png`、`web/public/icon-512.png`

本地验证：

```bash
npm run web:build
npm run web:preview
```

## 其他文档

- 运行限制说明：`docs/ops/limits.md`
