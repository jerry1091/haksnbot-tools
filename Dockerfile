FROM node:20-slim

# canvas / node-canvas-webgl native build deps + xvfb for vision
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libgl1-mesa-dev \
    libxi-dev \
    pkg-config \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Apply MC 1.21.2 compat patches (idempotent — safe to run even if stubs are pending)
COPY patch-deps.sh ./
RUN bash patch-deps.sh || true

# Copy source
COPY auth.js ./
COPY src ./src

ENV MCP_TRANSPORT=http
ENV MCP_PORT=3100

EXPOSE 3100

CMD ["node", "src/index.js"]
