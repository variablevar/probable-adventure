# ---------- Stage 1: Build ----------
FROM node:18 AS builder

WORKDIR /usr/src/app

# Install dependencies (including dev dependencies for building)
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Generate Prisma client
RUN npx prisma generate

# ---------- Stage 2: Production ----------
FROM node:18-alpine

WORKDIR /usr/src/app

# Install only production dependencies
COPY package*.json ./
RUN npm install --production

# Copy built files and node_modules from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/prisma ./prisma

# Set environment for production
ENV NODE_ENV=production

# Mount Prisma directory (for schema and migration persistence)
VOLUME ["/usr/src/app/prisma"]

# Start the bot (customize entry point if different)
CMD ["node", "dist/index.js"]
