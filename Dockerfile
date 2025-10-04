FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache curl python3 make g++

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy package files
COPY package*.json tsconfig.json ./
RUN npm ci && npm cache clean --force

# Copy source
COPY . .

# Generate Prisma and build
RUN npx prisma generate && npm run build

# Change ownership
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "start"]