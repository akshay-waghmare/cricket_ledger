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

# Build TypeScript code
RUN npm run build

# Expose the port (change if your app uses a different port)
EXPOSE 3000

# Start the application using the compiled JavaScript
CMD ["npm", "start"]
