# Cricket Bookmaker App

A cricket betting ledger system built with Node.js, Express, MongoDB and TypeScript.

## Features

- User authentication and management
- Match tracking
- Bet placement and tracking
- Dashboard with betting history

## Docker Setup

This application is containerized with Docker and Docker Compose for easy deployment.

### Prerequisites

- Docker
- Docker Compose

### Running with Docker Compose

1. Clone this repository:
   ```bash
   git clone https://github.com/akshay-waghmare/cricket_ledger.git
   cd cricket_ledger
   ```

2. Start the application:
   ```bash
   docker-compose up -d
   ```
   This will start both the application and MongoDB containers in detached mode.

3. Access the application:
   Open your browser and navigate to `http://localhost:3000`

4. Stop the application:
   ```bash
   docker-compose down
   ```
   To stop and remove the containers.

### Development with Docker

For development with hot reloading and TypeScript compilation:

1. Use the development Docker Compose file:
   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

2. The development setup will:
   - Watch for file changes and recompile TypeScript automatically
   - Restart the application when changes are detected
   - Keep TypeScript compilation and JavaScript execution separate

The Docker setup ensures TypeScript is always compiled to JavaScript before running:

- Production setup uses a dedicated entrypoint script that compiles TypeScript
- Development setup uses nodemon to watch for changes and rebuild

## Environment Variables

The application uses the following environment variables:

- `PORT`: The port the application runs on (default: 3000)
- `NODE_ENV`: Runtime environment (development/production)
- `MONGO_URI`: MongoDB connection string
- `SESSION_SECRET`: Secret key for session encryption

## Manual Setup (without Docker)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Make sure MongoDB is running on localhost:27017 or configure the `MONGO_URI` in `.env` file.

3. Build the TypeScript code:
   ```bash
   npm run build
   ```

4. Start the application:
   ```bash
   npm start
   ```

## Scripts

- `npm run build`: Compile TypeScript files
- `npm start`: Start the application (runs compiled JavaScript)
- `npm run dev`: Run in development mode with ts-node (compiles on-the-fly)
- `npm run watch`: Run with nodemon for auto-reloading