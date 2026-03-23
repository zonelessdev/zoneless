# Zoneless API - Cloud Run Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application
COPY main.js ./
COPY assets/ ./assets/ 2>/dev/null || true

# Cloud Run uses PORT env var
ENV PORT=8080
EXPOSE 8080

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

CMD ["node", "main.js"]

