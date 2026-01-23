# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files and install ALL dependencies (including dev)
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client and build
RUN npx prisma generate && npm run build

# Production stage
FROM node:18-alpine AS production

# Install curl for health checks and create user
RUN apk add --no-cache curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Create app directory with correct ownership
RUN mkdir -p /app && chown -R nextjs:nodejs /app

# Set working directory and switch to user
WORKDIR /app
USER nextjs

# Copy package.json and install production dependencies
COPY --chown=nextjs:nodejs package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist

# Copy prisma schema (needed for runtime)
COPY --chown=nextjs:nodejs prisma ./prisma

# Copy any other runtime files you need (adjust as needed)
COPY --chown=nextjs:nodejs src/utils/logger.ts ./src/utils/logger.ts

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["npm", "start"]