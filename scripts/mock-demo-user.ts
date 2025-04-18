import fs from 'fs';
import bcrypt from 'bcryptjs';
import path from 'path';

async function createMockUser() {
  try {
    // Generate hashed password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    
    // Create a demo user object
    const mockUser = {
      id: 'demo123',
      name: 'Demo User',
      email: 'demo@example.com',
      password: hashedPassword,
      subscription: {
        plan: 'premium',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Save to mock data file
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(dataDir, 'mock-user.json'), 
      JSON.stringify(mockUser, null, 2)
    );
    
    console.log('Mock demo user created successfully:');
    console.log('Email: demo@example.com');
    console.log('Password: password123');
    console.log(`User data saved to ${path.join(dataDir, 'mock-user.json')}`);
    console.log('You can use this data to manually set up the user in your application.');
  } catch (error) {
    console.error('Error creating mock user:', error);
  }
}

createMockUser();
