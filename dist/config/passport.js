"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = configurePassport;
const passport_1 = __importDefault(require("passport"));
const passport_local_1 = require("passport-local");
const User_1 = __importDefault(require("../models/User"));
function configurePassport() {
    // Local Strategy
    passport_1.default.use(new passport_local_1.Strategy({ usernameField: 'email' }, async (email, password, done) => {
        try {
            // Find user by email and cast to appropriate type
            const user = await User_1.default.findOne({ email });
            // If user doesn't exist
            if (!user) {
                return done(null, false, { message: 'Invalid email or password' });
            }
            // Check if user is active
            if (!user.isActive) {
                return done(null, false, { message: 'Your account has been deactivated' });
            }
            // Check if password matches
            const isMatch = await user.matchPassword(password);
            if (!isMatch) {
                return done(null, false, { message: 'Invalid email or password' });
            }
            // If all checks pass, return user
            return done(null, user);
        }
        catch (error) {
            return done(error);
        }
    }));
    // Serialize user for the session
    passport_1.default.serializeUser((user, done) => {
        done(null, user.id);
    });
    // Deserialize user from the session
    passport_1.default.deserializeUser(async (id, done) => {
        try {
            const user = await User_1.default.findOne({ id });
            done(null, user || false);
        }
        catch (error) {
            done(error);
        }
    });
}
