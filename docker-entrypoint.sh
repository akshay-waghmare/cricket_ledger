#!/bin/sh
set -e

# Always compile TypeScript first
echo "Compiling TypeScript..."
npm run build

# Start the application using compiled JavaScript
echo "Starting application..."
exec node dist/server.js