import express from 'express';
import path from 'path';
import expressLayouts from 'express-ejs-layouts';
import session from 'express-session';
import flash from 'connect-flash';
import passport from 'passport';
import mongoose from 'mongoose';
import { CricketLedgerService } from './cricket-ledger-service';
import matchRoutes from './routes/match-routes';
import userRoutes from './routes/user-routes';
import betRoutes from './routes/bet-routes';
import dataRoutes from './routes/data-routes';
import authRoutes from './routes/auth-routes';
import subscriptionRoutes from './routes/subscription-routes';
import { ensureAuthenticated, ensureAdmin, ensureActiveSubscription } from './middleware/auth';
import configurePassport from './config/passport';

// Initialize our cricket ledger service
const ledgerService = new CricketLedgerService();

// Create some sample data for demo purposes
const setupSampleData = () => {
  try {
    // Create a match
    ledgerService.createMatch('match-001', ['India', 'Australia']);
    ledgerService.createMatch('match-002', ['England', 'South Africa']);
    
    // Add users
    ledgerService.addUser('user-001', 1000);
    ledgerService.addUser('user-002', 2000);
    
    // Add some bets for demo
    ledgerService.addBet('match-001', 'user-001', 'back', 'India', 100, 2.0);
    ledgerService.addBet('match-001', 'user-002', 'lay', 'India', 200, 2.0);
    ledgerService.addBet('match-001', 'user-001', 'back', 'Australia', 50, 3.0);
  } catch (error) {
    // Sample data might already exist, ignore errors
    console.log('Sample data setup:', error instanceof Error ? error.message : 'Error setting up sample data');
  }
};

setupSampleData();

// Attach connection event listeners
mongoose.connection
  .on('connecting',  () => console.log('Mongoose: connecting…'))
  .on('connected',   () => console.log('Mongoose: connected!'))
  .on('error',       err => console.error('Mongoose connection error:', err))
  .on('disconnected',() => console.warn('Mongoose: disconnected'));

const startServer = async () => {
  try {
    const dbUri = process.env.MONGO_URI 
      || 'mongodb://127.0.0.1:27017/cricket_ledger';
    
    // await DB connection before anything else
    await mongoose.connect(dbUri, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS:       30000,
      socketTimeoutMS:        60000,
      bufferCommands:         true
    });
    console.log('✅ MongoDB connection established');

    // Create Express app
    const app = express();
    const port = process.env.PORT || 3000;

    // Configure middleware
    app.use(expressLayouts);
    app.set('view engine', 'ejs');
    // Always serve views and static assets from the project root (not dist subfolder)
    const root = process.cwd();
    app.set('views', path.join(root, 'views'));
    app.set('layout', 'layout');
    app.use(express.static(path.join(root, 'public')));
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    // Set up session middleware (required for flash messages)
    app.use(session({
      secret: 'cricket-ledger-secret',
      resave: false,
      saveUninitialized: true
    }));

    // Set up flash messages middleware
    app.use(flash());

    // Initialize passport
    app.use(passport.initialize());
    app.use(passport.session());
    configurePassport();

    // Make flash messages available to all views
    app.use((req, res, next) => {
      res.locals.success_msg = req.flash('success');
      res.locals.error_msg = req.flash('error');
      res.locals.error = req.flash('error');
      // Cast req to any to avoid TypeScript errors during transition
      const userReq = req as any;
      res.locals.user = userReq.user || null;
      next();
    });

    // Pass the ledger service to routes
    app.use((req, res, next) => {
      // Use type assertion to bypass TypeScript error
      (req as any).ledgerService = ledgerService;
      next();
    });

    // Routes
    app.get('/', (req, res) => {
      if ((req as any).isAuthenticated?.()) {
        return res.redirect('/dashboard');
      }
      res.render('login', { title: 'Login' });
    });

    // Public routes that don't require authentication
    app.use('/auth', authRoutes);
    // Maybe some public pages like landing page, etc.

    // Protected routes that require authentication
    app.use('/matches', ensureAuthenticated, matchRoutes);
    app.use('/users', ensureAuthenticated, userRoutes);
    app.use('/bets', ensureAuthenticated, betRoutes);
    app.use('/data', ensureAuthenticated, ensureAdmin, dataRoutes);
    app.use('/subscription', ensureAuthenticated, subscriptionRoutes);

    // Add this below your existing routes to render a dashboard after login
    app.get(
      '/dashboard',
      ensureAuthenticated,
      (req, res) => {
        res.render('dashboard', {
          title: 'Dashboard',
          user: (req as any).user
        });
      }
    );

    // Error handling middleware
    app.use((req, res) => {
      res.status(404).render('error', { 
        message: 'Page not found',
        title: 'Error - Page Not Found'
      });
    });

    // now safe to start listening
    app.listen(port, () => {
      console.log(`Cricket Ledger app listening at http://localhost:${port}`);
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

startServer();