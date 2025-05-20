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

# Make the entrypoint script executable
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Build TypeScript code during build time
RUN npm run build

# Expose the port (change if your app uses a different port)
EXPOSE 3000

# Use entrypoint script to ensure TypeScript is compiled before running
ENTRYPOINT ["docker-entrypoint.sh"]
