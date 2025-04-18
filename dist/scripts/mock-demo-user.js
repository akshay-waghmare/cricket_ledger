"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const path_1 = __importDefault(require("path"));
async function createMockUser() {
    try {
        // Generate hashed password
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash('password123', salt);
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
        const dataDir = path_1.default.join(__dirname, '../data');
        if (!fs_1.default.existsSync(dataDir)) {
            fs_1.default.mkdirSync(dataDir, { recursive: true });
        }
        fs_1.default.writeFileSync(path_1.default.join(dataDir, 'mock-user.json'), JSON.stringify(mockUser, null, 2));
        console.log('Mock demo user created successfully:');
        console.log('Email: demo@example.com');
        console.log('Password: password123');
        console.log(`User data saved to ${path_1.default.join(dataDir, 'mock-user.json')}`);
        console.log('You can use this data to manually set up the user in your application.');
    }
    catch (error) {
        console.error('Error creating mock user:', error);
    }
}
createMockUser();
