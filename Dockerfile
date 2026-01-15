# ===================================
# Olly Molly Docker Image
# AI Development Team Management App
# ===================================

# Base: Node.js 20 LTS on Debian Bookworm
# Claude Code requires Node.js 18+
FROM node:20-bookworm

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* bun.lock* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy application source
COPY . .

# Build Next.js production bundle
RUN npm run build

# Create directories for volume mounts
RUN mkdir -p /app/db /root/.olly-molly /root/.claude

# Expose the application port
EXPOSE 1234

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:1234/ || exit 1

# Start the application
CMD ["npm", "start"]
