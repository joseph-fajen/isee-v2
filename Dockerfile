FROM oven/bun:1.1-alpine

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy application
COPY src/ ./src/
COPY public/ ./public/
COPY tsconfig.json ./

# Create data directory
RUN mkdir -p /app/data /app/output

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV ISEE_DATABASE_PATH=/app/data/isee.db

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Run
EXPOSE 3000
CMD ["bun", "run", "src/server.ts"]
