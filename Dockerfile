FROM node:22-alpine

# Install system dependencies
RUN apk add --no-cache curl python3 make g++

# Create user and directory
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 && \
    mkdir -p /app && \
    chown -R nextjs:nodejs /app

WORKDIR /app

# Copy package files as root first
COPY package*.json tsconfig.json ./

# Install all dependencies as root
RUN npm ci && npm cache clean --force

# Copy all source code
COPY . .

# Generate Prisma and build as root
RUN npx prisma generate && npm run build && chmod +x entrypoint.sh

# Now change ownership of everything to nextjs
RUN chown -R nextjs:nodejs /app

# Switch to nextjs user
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["sh", "entrypoint.sh"]