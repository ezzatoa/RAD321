# =============================================================================
# RAD 321 — Production Dockerfile for Dokploy / VPS Deployment
# =============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Install native compilation build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

# Seed initial database structure
RUN node server/db/seed.js

# Production Runtime Container
FROM node:20-alpine AS runner

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy application and pre-compiled node_modules
COPY --from=builder /app /app

# Expose Dokploy target port
EXPOSE 3000

# Start server
CMD ["node", "server/server.js"]
