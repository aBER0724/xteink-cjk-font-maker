FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS dev
WORKDIR /app
COPY . .

FROM dev AS build
WORKDIR /app
RUN npm run build

FROM node:22-bookworm-slim AS production
ARG CPFONT_TOOL_COMMIT=c242803dbd47f13fa5886bf0701db72871709d23
WORKDIR /app
ENV NODE_ENV=production \
    CPFONT_TOOL_ROOT=/opt/crosspoint-cjk-fonts \
    CPFONT_PYTHON=/opt/cpfont-venv/bin/python \
    PORT=3000

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --filter=blob:none https://github.com/aBER0724/crosspoint-cjk-fonts.git "$CPFONT_TOOL_ROOT" \
    && cd "$CPFONT_TOOL_ROOT" \
    && git checkout --detach "$CPFONT_TOOL_COMMIT" \
    && python3 -m venv /opt/cpfont-venv \
    && /opt/cpfont-venv/bin/pip install --no-cache-dir -r requirements.txt \
    && /opt/cpfont-venv/bin/python scripts/fetch_fallback.py \
    && /opt/cpfont-venv/bin/python -c "from scripts.cpfont_version import CPFONT_VERSION; assert CPFONT_VERSION == 4" \
    && test -f vendor/NotoSans-Regular.ttf

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
