import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import User from '../models/User';
import { AuthUser } from '../types'; // Import AuthUser from types.ts

// Define the done callback type for passport
type DoneCallback = (error: Error | null, user?: Express.User | false, options?: { message: string }) => void;

export default function configurePassport() {
  // Local Strategy
  passport.use(
    new LocalStrategy({ usernameField: 'email' }, 
      async (email: string, password: string, done: DoneCallback) => {
        try {
          // Find user by email and cast to appropriate type
          const user = await User.findOne({ email });
          
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
          return done(null, user as unknown as Express.User);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );

  // Serialize user for the session
  passport.serializeUser((user: Express.User, done: (err: Error | null, id?: string) => void) => {
    done(null, user.id);
  });

  // Deserialize user from the session
  passport.deserializeUser(async (id: string, done: (err: Error | null, user?: Express.User | false) => void) => {
    try {
      const user = await User.findOne({ id });
      done(null, user || false);
    } catch (error) {
      done(error as Error);
    }
  });
}
