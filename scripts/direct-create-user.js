const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function createDemoUser() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  
  try {
    // Connect directly to MongoDB
    await client.connect();
    console.log("Connected successfully to MongoDB");
    
    // List all databases to check if cricket_ledger exists
    const adminDb = client.db('admin');
    const dbList = await adminDb.admin().listDatabases();
    const dbExists = dbList.databases.some(db => db.name === 'cricket_ledger');
    
    console.log(`Database cricket_ledger ${dbExists ? 'exists' : 'does not exist yet'}`);
    
    // Use the database (will be created automatically when we insert data)
    const db = client.db('cricket_ledger');
    
    // Check if users collection exists
    const collections = await db.listCollections().toArray();
    const usersCollectionExists = collections.some(col => col.name === 'users');
    
    console.log(`Users collection ${usersCollectionExists ? 'exists' : 'does not exist yet'}`);
    
    // Get the users collection (creates it if it doesn't exist)
    const usersCollection = db.collection('users');
    
    // Check if user exists
    const existingUser = await usersCollection.findOne({ email: 'demo@example.com' });
    
    if (existingUser) {
      console.log('Demo user already exists with the following credentials:');
      console.log('Email: demo@example.com');
      console.log('Password: password123');
      return;
    }
    
    // Create new user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    
    // Insert a document which will create both the database and collection if they don't exist
    const result = await usersCollection.insertOne({
      name: 'Demo User',
      email: 'demo@example.com',
      password: hashedPassword,
      subscription: {
        plan: 'premium',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log(`Demo user created successfully with ID: ${result.insertedId}`);
    console.log('Login credentials:');
    console.log('Email: demo@example.com');
    console.log('Password: password123');
    
    // Verify the database was created
    const updatedDbList = await adminDb.admin().listDatabases();
    console.log('Current databases:', updatedDbList.databases.map(db => db.name).join(', '));
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

createDemoUser().catch(console.error);
