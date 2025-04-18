"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const express_ejs_layouts_1 = __importDefault(require("express-ejs-layouts"));
const express_session_1 = __importDefault(require("express-session"));
const connect_flash_1 = __importDefault(require("connect-flash"));
const passport_1 = __importDefault(require("passport"));
const mongoose_1 = __importDefault(require("mongoose"));
const cricket_ledger_service_1 = require("./cricket-ledger-service");
const match_routes_1 = __importDefault(require("./routes/match-routes"));
const user_routes_1 = __importDefault(require("./routes/user-routes"));
const bet_routes_1 = __importDefault(require("./routes/bet-routes"));
const data_routes_1 = __importDefault(require("./routes/data-routes"));
const auth_routes_1 = __importDefault(require("./routes/auth-routes"));
const subscription_routes_1 = __importDefault(require("./routes/subscription-routes"));
const auth_1 = require("./middleware/auth");
const passport_2 = __importDefault(require("./config/passport"));
// Initialize our cricket ledger service
const ledgerService = new cricket_ledger_service_1.CricketLedgerService();
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
    }
    catch (error) {
        // Sample data might already exist, ignore errors
        console.log('Sample data setup:', error instanceof Error ? error.message : 'Error setting up sample data');
    }
};
setupSampleData();
// Attach connection event listeners
mongoose_1.default.connection
    .on('connecting', () => console.log('Mongoose: connecting…'))
    .on('connected', () => console.log('Mongoose: connected!'))
    .on('error', err => console.error('Mongoose connection error:', err))
    .on('disconnected', () => console.warn('Mongoose: disconnected'));
const startServer = async () => {
    try {
        const dbUri = process.env.MONGO_URI
            || 'mongodb://127.0.0.1:27017/cricket_ledger';
        // await DB connection before anything else
        await mongoose_1.default.connect(dbUri, {
            serverSelectionTimeoutMS: 30000,
            connectTimeoutMS: 30000,
            socketTimeoutMS: 60000,
            bufferCommands: true
        });
        console.log('✅ MongoDB connection established');
        // Create Express app
        const app = (0, express_1.default)();
        const port = process.env.PORT || 3000;
        // Configure middleware
        app.use(express_ejs_layouts_1.default);
        app.set('view engine', 'ejs');
        app.set('views', path_1.default.join(__dirname, 'views'));
        app.set('layout', 'layout'); // This ensures the layout file is used globally
        app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
        app.use(express_1.default.urlencoded({ extended: true }));
        app.use(express_1.default.json());
        // Set up session middleware (required for flash messages)
        app.use((0, express_session_1.default)({
            secret: 'cricket-ledger-secret',
            resave: false,
            saveUninitialized: true
        }));
        // Set up flash messages middleware
        app.use((0, connect_flash_1.default)());
        // Initialize passport
        app.use(passport_1.default.initialize());
        app.use(passport_1.default.session());
        (0, passport_2.default)();
        // Make flash messages available to all views
        app.use((req, res, next) => {
            res.locals.success_msg = req.flash('success');
            res.locals.error_msg = req.flash('error');
            res.locals.error = req.flash('error');
            // Cast req to any to avoid TypeScript errors during transition
            const userReq = req;
            res.locals.user = userReq.user || null;
            next();
        });
        // Pass the ledger service to routes
        app.use((req, res, next) => {
            // Use type assertion to bypass TypeScript error
            req.ledgerService = ledgerService;
            next();
        });
        // Routes
        app.get('/', (req, res) => {
            if (req.isAuthenticated?.()) {
                return res.redirect('/dashboard');
            }
            res.render('login', { title: 'Login' });
        });
        // Public routes that don't require authentication
        app.use('/auth', auth_routes_1.default);
        // Maybe some public pages like landing page, etc.
        // Protected routes that require authentication
        app.use('/matches', auth_1.ensureAuthenticated, match_routes_1.default);
        app.use('/users', auth_1.ensureAuthenticated, user_routes_1.default);
        app.use('/bets', auth_1.ensureAuthenticated, bet_routes_1.default);
        app.use('/data', auth_1.ensureAuthenticated, auth_1.ensureAdmin, data_routes_1.default);
        app.use('/subscription', auth_1.ensureAuthenticated, subscription_routes_1.default);
        // Add this below your existing routes to render a dashboard after login
        app.get('/dashboard', auth_1.ensureAuthenticated, (req, res) => {
            res.render('dashboard', {
                title: 'Dashboard',
                user: req.user
            });
        });
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
    }
    catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
};
startServer();
