# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies (including dev dependencies for TypeScript compilation)
RUN npm install

# Copy the rest of the application code
COPY . .


# Remove legacy entrypoint script to avoid startup errors
# (docker-entrypoint.sh is no longer used)
# Clear any existing entrypoint
ENTRYPOINT []

# Build TypeScript code during build time
RUN npm run build \
    # Copy view templates and static assets into dist for production
    && mkdir -p dist/views dist/public \
    && cp -R views/* dist/views/ \
    && cp -R public/* dist/public/

# Expose the port (change if your app uses a different port)
EXPOSE 3000

## In production, run the compiled JavaScript directly
CMD ["node", "dist/server.js"]
