import express, { Request, Response, NextFunction } from 'express';

// Extend Express User interface to include id property
declare global {
  namespace Express {
    interface User {
      id: string; // Changed to string only to match passport's expectations
    }
  }
}

// Importing middleware and models
import { ensureAuthenticated } from '../middleware/auth';
import User from '../models/User';

const router = express.Router();

// @route   GET /subscription/plans
// @desc    Show subscription plans page
// @access  Private
router.get('/plans', ensureAuthenticated, (req: Request, res: Response) => {
  res.render('subscription/plans', {
    title: 'Subscription Plans - Cricket Bookmaker App'
  });
});

// @route   POST /subscription/subscribe
// @desc    Process subscription (mock implementation)
// @access  Private
router.post('/subscribe', ensureAuthenticated, async (req: Request, res: Response) => {
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
    } else if (plan === 'premium') {
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
    await User.findOneAndUpdate(
      { id: req.user.id },
      {
        subscription: {
          plan,
          expiresAt
        }
      }
    );
    
    req.flash('success', `You have successfully subscribed to the ${plan.toUpperCase()} plan`);
    res.redirect('/');
  } catch (error) {
    console.error('Subscription error:', error);
    req.flash('error', 'An error occurred while processing your subscription');
    res.redirect('/subscription/plans');
  }
});

export default router;
