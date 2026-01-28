FROM oven/bun:1.0.25-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files first for better caching
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Set environment
ENV NODE_ENV=production

# Expose the default port
EXPOSE 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${APP_PORT:-9090}/health || exit 1

# Run the application
CMD ["bun", "run", "index.ts"]
