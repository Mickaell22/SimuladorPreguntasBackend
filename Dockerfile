# ---- Stage 1: dependencies ----
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first to leverage layer cache
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# ---- Stage 2: runtime ----
FROM node:20-alpine AS runtime

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy installed modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all application source
COPY . .

# Own the workdir as the non-root user
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

# Start the application
CMD ["node", "index.js"]
