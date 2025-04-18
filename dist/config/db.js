"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const connectDB = async () => {
    try {
        // MongoDB connection string - using environment variable or default to localhost
        const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/cricket_ledger';
        const conn = await mongoose_1.default.connect(mongoURI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    }
    catch (error) {
        console.error(`Error connecting to MongoDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1); // Exit with failure
    }
};
exports.default = connectDB;
