import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';

// Try to load environment variables, but continue if dotenv is not available
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch (error) {
  console.log('dotenv not found, using default or environment variables');
}

// Import User model
import User from '../models/User';

// Try different connection strings if the main one fails
const CONNECTION_STRINGS = [
  'mongodb://127.0.0.1:27017/cricket_ledger', // Use this as primary since Docker is confirmed to work
  process.env.MONGO_URI,
  'mongodb://localhost:27017/cricket_ledger',
  'mongodb://host.docker.internal:27017/cricket_ledger'
];

// MongoDB connection
const connectDB = async (): Promise<void> => {
  let lastError;
  
  // Try each connection string until one works
  for (const uri of CONNECTION_STRINGS) {
    if (!uri) continue;
    
    try {
      console.log(`Attempting to connect to MongoDB at: ${uri}`);
      
      // Updated options for MongoDB 8.x with increased timeouts
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 30000,  // Increased from 10000 to 30000
        connectTimeoutMS: 30000,          // Increased from 15000 to 30000
        socketTimeoutMS: 60000,           // Increased from 45000 to 60000
        bufferCommands: true              // Enable command buffering
        // Removed bufferTimeoutMS as it's not supported in the ConnectOptions type
      });
      
      // Wait for a moment to ensure connection is fully established - this helps prevent timeout issues
      console.log("Connection established, waiting for readiness...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      
      // Simple test to verify actual database access
      try {
        // Check if db is defined before using it
        if (mongoose.connection.db) {
          // Try a basic operation to verify database access
          const dbs = await mongoose.connection.db.admin().listDatabases();
          console.log(`Successfully connected to MongoDB. Available databases: ${dbs.databases.map(db => db.name).join(', ')}`);
          
          // Force creation of cricket_ledger database by creating a users collection
          const dbName = 'cricket_ledger';
          console.log(`Explicitly ensuring database '${dbName}' exists...`);
          
          // Switch to the cricket_ledger database explicitly using type assertion
          const cricketLedgerDb = (mongoose.connection as any).client.db(dbName);
          
          // Create users collection to force database creation
          console.log("Creating users collection to ensure database exists...");
          try {
            await cricketLedgerDb.createCollection('users');
            console.log("Users collection created successfully!");
          } catch (collErr) {
            // Collection might already exist, which is fine
            if (collErr instanceof Error && collErr.message.includes('already exists')) {
              console.log("Users collection already exists, which is good!");
            } else {
              console.warn(`Warning when creating collection: ${collErr instanceof Error ? collErr.message : String(collErr)}`);
            }
          }
          
          // Verify database was created
          const updatedDbs = await mongoose.connection.db.admin().listDatabases();
          if (updatedDbs.databases.some(db => db.name === dbName)) {
            console.log(`✅ Success: Database '${dbName}' now exists!`);
          } else {
            console.warn(`⚠️ Warning: Database '${dbName}' still not visible in database list. This might be a permissions issue.`);
          }
        } else {
          console.warn("Database connection exists but db object is undefined");
        }
      } catch (err) {
        console.warn(`Connected to server but couldn't list databases: ${err instanceof Error ? err.message : String(err)}`);
        console.warn("Continuing anyway - this may be due to permission restrictions");
      }
      
      return; // Connection successful, exit function
    } catch (error) {
      lastError = error;
      console.log(`Failed to connect with ${uri}: ${error instanceof Error ? error.message : String(error)}`);
      // Continue to the next connection string
    }
  }
  
  // If we get here, all connection attempts failed
  console.error('All MongoDB connection attempts failed');
  console.error(`Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  console.error('\nDocker-specific troubleshooting:');
  console.error('1. Check if the MongoDB container is running: `docker ps | grep mongo`');
  console.error('2. Verify port mapping: `docker port <mongo_container_id>`');
  console.error('3. Try connecting from inside the container: `docker exec -it <mongo_container_id> mongo`');
  console.error('4. Check network settings: `docker network inspect bridge`');
  process.exit(1);
};

// Modify the createDemoUser function to use higher timeout values
const createDemoUser = async (): Promise<void> => {
  try {
    console.log("Checking if demo user already exists...");
    
    // Add a small delay to ensure connection is fully ready for operations
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if collections exist first
    try {
      if (mongoose.connection.db) {
        const collections = await mongoose.connection.db.listCollections().toArray();
        if (!collections.some(col => col.name === 'users')) {
          console.log("Users collection doesn't exist yet, creating it now...");
          await mongoose.connection.db.createCollection('users');
        }
      } else {
        console.warn("Database connection exists but db object is undefined");
      }
    } catch (err) {
      console.warn(`Note: ${err instanceof Error ? err.message : String(err)}`);
    }
    
    // Try direct MongoDB operations first before using Mongoose model
    let existingUser = null;
    try {
      // Try direct MongoDB query first with increased timeout
      if (mongoose.connection.db) {
        console.log("Checking for existing user with direct MongoDB query...");
        existingUser = await mongoose.connection.db.collection('users')
          .findOne({ email: 'demo@example.com' }, { maxTimeMS: 15000 }); // Increased from 5000 to 15000
      }
    } catch (directError) {
      console.warn(`Direct MongoDB query failed: ${directError instanceof Error ? directError.message : String(directError)}`);
    }
    
    // If direct query didn't work, try with Mongoose model
    if (existingUser === null) {
      try {
        console.log("Trying Mongoose model query...");
        existingUser = await User.findOne({ email: 'demo@example.com' }).maxTimeMS(15000); // Increased from 5000 to 15000
      } catch (modelError) {
        console.warn(`Mongoose model query failed: ${modelError instanceof Error ? modelError.message : String(modelError)}`);
        // Continue anyway - we'll assume the user doesn't exist
      }
    }
    
    if (existingUser) {
      console.log('Demo user already exists with the following credentials:');
      console.log('Email: demo@example.com');
      console.log('Password: password123');
      return;
    }
    
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    
    // Prepare user document
    const userDocument = {
      name: 'Demo User',
      email: 'demo@example.com',
      password: hashedPassword,
      subscription: {
        plan: 'premium',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Try to create user with direct MongoDB operations first
    let userCreated = false;
    try {
      if (mongoose.connection.db) {
        console.log("Creating user with direct MongoDB insert...");
        const result = await mongoose.connection.db.collection('users').insertOne(userDocument);
        if (result.acknowledged) {
          userCreated = true;
          console.log(`User created with ID: ${result.insertedId}`);
        }
      }
    } catch (insertError) {
      console.warn(`Direct insert failed: ${insertError instanceof Error ? insertError.message : String(insertError)}`);
    }
    
    // If direct insert failed, try with Mongoose model
    if (!userCreated) {
      try {
        console.log("Trying to create user with Mongoose model...");
        const user = await User.create(userDocument);
        console.log(`User created with Mongoose ID: ${user._id}`);
        userCreated = true;
      } catch (createError) {
        console.error(`Mongoose create failed: ${createError instanceof Error ? createError.message : String(createError)}`);
        throw createError; // Re-throw to be caught by outer catch block
      }
    }
    
    if (userCreated) {
      console.log('Demo user created successfully with the following credentials:');
      console.log('Email: demo@example.com');
      console.log('Password: password123');
    } else {
      console.error('Failed to create user through all available methods');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Error creating demo user:');
    
    if (error instanceof Error && error.message.includes('timed out')) {
      console.error('Database operation timed out. MongoDB may be running but responding slowly or not accessible.');
      console.error('Try restarting MongoDB or check system resources.');
    } else {
      console.error(error);
    }
    
    process.exit(1);
  }
};

// Execute the script
const run = async (): Promise<void> => {
  // log every connection event
  mongoose.connection
    .on('connecting',  () => console.log('Mongoose connecting…'))
    .on('connected',   () => console.log('Mongoose connected!'))
    .on('error',       err => console.error('Mongoose connection error:', err))
    .on('disconnected',() => console.warn('Mongoose disconnected'));
  
  await connectDB();    // make sure this resolves without error
  await createDemoUser();
  process.exit(0);
};

run();
