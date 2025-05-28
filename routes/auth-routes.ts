import express from 'express';
import passport from 'passport';
import User from '../models/User';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// @route   GET /auth/login
// @desc    Show login form
// @access  Public
router.get('/login', (req, res) => {
  // If already logged in, redirect to home
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  
  res.render('auth/login', {
    title: 'Login - Cricket Bookmaker App'
  });
});

// @route   POST /auth/login
// @desc    Process login
// @access  Public
router.post('/login', (req, res, next) => {
  passport.authenticate('local', {
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
    title: 'Register - Cricket Bookmaker App'
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
        title: 'Register - Cricket Bookmaker App'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      errors.push('Email is already registered');
      return res.render('auth/register', {
        errors,
        name,
        email,
        title: 'Register - Cricket Bookmaker App'
      });
    }

    // Create new user
    const newUser = new User({
      id: uuidv4(),
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
  } catch (error) {
    console.error('Registration error:', error);
    res.render('auth/register', {
      errors: ['An unexpected error occurred'],
      title: 'Register - Cricket Bookmaker App'
    });
  }
});

// @route   GET /auth/logout
// @desc    Logout user
// @access  Private
router.get('/logout', (req, res, next) => {
  req.logout((err: Error | undefined) => {
    if (err) { return next(err); }
    req.flash('success', 'You are logged out');
    res.redirect('/auth/login');
  });
});

export default router;
