FROM ubuntu:noble

# Install Node.js 18 from Ubuntu APT (same version/ABI as the pre-built native modules)
# The pre-built better-sqlite3.node links against libnode109 from this package
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the full repo including patched node_modules (no npm install — preserves 26.1.2 patches)
# node_modules contains critical patches for MC 26.1.2 compatibility that must NOT be regenerated
COPY . ./

ENV MCP_TRANSPORT=http
ENV MCP_PORT=3100

EXPOSE 3100

# restart: no — Claudio is manually launched, not an always-on service
CMD ["node", "src/index.js"]
