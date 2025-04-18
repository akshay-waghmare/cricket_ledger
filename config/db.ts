import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    // MongoDB connection string - using environment variable or default to localhost
    const mongoURI: string = process.env.MONGO_URI || 'mongodb://localhost:27017/cricket_ledger';
    
    const conn = await mongoose.connect(mongoURI);
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1); // Exit with failure
  }
};

export default connectDB;
