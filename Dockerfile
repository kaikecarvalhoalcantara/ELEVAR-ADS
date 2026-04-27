# =============================================================================
# Automador de Ads — Dockerfile pra Railway/Render
#
# Baseado em Node 20 + Chromium do sistema (pra Remotion renderar sem
# precisar baixar próprio Chromium em runtime).
# =============================================================================

FROM node:20-bookworm-slim

WORKDIR /app

# Chromium + ffmpeg + libs que o headless Chrome precisa
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    ca-certificates \
    dumb-init \
  && rm -rf /var/lib/apt/lists/*

# Diz ao Remotion pra usar o Chromium do sistema (em vez de baixar)
ENV REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Storage — usamos /tmp/elevar-storage que SEMPRE funciona em qualquer container.
# /tmp persiste durante a vida do container (entre requests) mas some no redeploy.
# Pra persistência total: configurar volume Railway em /data e mudar isto pra /data
# (mas hoje o volume Railway tem comportamento esquisito que ENOENT em runtime).
ENV STORAGE_DIR=/tmp/elevar-storage

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# dumb-init pra forwarding correto de SIGTERM (Railway envia ao redeploy)
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]
