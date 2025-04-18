"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
// Importing middleware and models
const auth_1 = require("../middleware/auth");
const User_1 = __importDefault(require("../models/User"));
const router = express_1.default.Router();
// @route   GET /subscription/plans
// @desc    Show subscription plans page
// @access  Private
router.get('/plans', auth_1.ensureAuthenticated, (req, res) => {
    res.render('subscription/plans', {
        title: 'Subscription Plans - Cricket Betting Ledger'
    });
});
// @route   POST /subscription/subscribe
// @desc    Process subscription (mock implementation)
// @access  Private
router.post('/subscribe', auth_1.ensureAuthenticated, async (req, res) => {
    try {
        const { plan } = req.body;
        // Validate plan
        if (!['free', 'basic', 'premium'].includes(plan)) {
            req.flash('error', 'Invalid subscription plan');
            return res.redirect('/subscription/plans');
        }
        // In a real app, you would process payment here via Stripe or another payment processor
        // Calculate expiration date based on plan
        let expirationDays = 30; // Default is 30 days
        if (plan === 'basic') {
            expirationDays = 30;
        }
        else if (plan === 'premium') {
            expirationDays = 365; // 1 year
        }
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expirationDays);
        // Make sure user exists before proceeding
        if (!req.user || !req.user.id) {
            req.flash('error', 'User authentication error');
            return res.redirect('/subscription/plans');
        }
        // Update user subscription
        await User_1.default.findOneAndUpdate({ id: req.user.id }, {
            subscription: {
                plan,
                expiresAt
            }
        });
        req.flash('success', `You have successfully subscribed to the ${plan.toUpperCase()} plan`);
        res.redirect('/');
    }
    catch (error) {
        console.error('Subscription error:', error);
        req.flash('error', 'An error occurred while processing your subscription');
        res.redirect('/subscription/plans');
    }
});
exports.default = router;
