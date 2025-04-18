"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const passport_1 = __importDefault(require("passport"));
const User_1 = __importDefault(require("../models/User"));
const uuid_1 = require("uuid");
const router = express_1.default.Router();
// @route   GET /auth/login
// @desc    Show login form
// @access  Public
router.get('/login', (req, res) => {
    // If already logged in, redirect to home
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render('auth/login', {
        title: 'Login - Cricket Betting Ledger'
    });
});
// @route   POST /auth/login
// @desc    Process login
// @access  Public
router.post('/login', (req, res, next) => {
    passport_1.default.authenticate('local', {
        successRedirect: '/',
        failureRedirect: '/auth/login',
        failureFlash: true
    })(req, res, next);
});
// @route   GET /auth/register
// @desc    Show registration form
// @access  Public
router.get('/register', (req, res) => {
    // If already logged in, redirect to home
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render('auth/register', {
        title: 'Register - Cricket Betting Ledger'
    });
});
// @route   POST /auth/register
// @desc    Process registration
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, password2 } = req.body;
        const errors = [];
        // Check required fields
        if (!name || !email || !password || !password2) {
            errors.push('Please fill in all fields');
        }
        // Check passwords match
        if (password !== password2) {
            errors.push('Passwords do not match');
        }
        // Check password length
        if (password.length < 6) {
            errors.push('Password should be at least 6 characters');
        }
        // If there are errors, re-render the form
        if (errors.length > 0) {
            return res.render('auth/register', {
                errors,
                name,
                email,
                title: 'Register - Cricket Betting Ledger'
            });
        }
        // Check if email already exists
        const existingUser = await User_1.default.findOne({ email });
        if (existingUser) {
            errors.push('Email is already registered');
            return res.render('auth/register', {
                errors,
                name,
                email,
                title: 'Register - Cricket Betting Ledger'
            });
        }
        // Create new user
        const newUser = new User_1.default({
            id: (0, uuid_1.v4)(),
            name,
            email,
            password,
            role: 'user',
            subscription: {
                plan: 'free',
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days trial
            }
        });
        // Save the user
        await newUser.save();
        // Also create a ledger user with initial balance
        if (req.ledgerService) {
            req.ledgerService.addUser(newUser.id, 1000); // Give 1000 starting balance
        }
        // Flash success message and redirect to login
        req.flash('success', 'You are now registered and can log in');
        res.redirect('/auth/login');
    }
    catch (error) {
        console.error('Registration error:', error);
        res.render('auth/register', {
            errors: ['An unexpected error occurred'],
            title: 'Register - Cricket Betting Ledger'
        });
    }
});
// @route   GET /auth/logout
// @desc    Logout user
// @access  Private
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.flash('success', 'You are logged out');
        res.redirect('/auth/login');
    });
});
exports.default = router;
