import { Request, Response, NextFunction } from 'express';
import { AuthUser } from '../types';

/**
 * Authentication middleware to ensure a user is logged in
 * 
 * IMPORTANT: This middleware must be added to routes that require authentication.
 * Example usage: app.use('/protected-route', ensureAuthenticated, routeHandler);
 */
export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error', 'Please log in to view this resource');
  res.redirect('/auth/login');
}

/**
 * Authentication middleware to ensure a user is an admin
 * 
 * IMPORTANT: This middleware should be used after ensureAuthenticated
 * Example usage: app.use('/admin-route', ensureAuthenticated, ensureAdmin, routeHandler);
 */
export function ensureAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user) {
    // Type assertion to AuthUser since we know this is coming from the auth system
    const user = req.user as unknown as AuthUser;
    if (user.role === 'admin') {
      return next();
    }
  }
  req.flash('error', 'Access denied. Admin privileges required.');
  res.redirect('/');
}

/**
 * Authentication middleware to ensure a user has an active subscription
 * 
 * IMPORTANT: This middleware should be used after ensureAuthenticated
 * Example usage: app.use('/subscription-route', ensureAuthenticated, ensureActiveSubscription, routeHandler);
 */
export function ensureActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    // Add a check to ensure user exists
    if (!req.user) {
      req.flash('error', 'Authentication error');
      return res.redirect('/auth/login');
    }
    
    // Type assertion to AuthUser since we know this is coming from the auth system
    const user = req.user as unknown as AuthUser;
    
    // If they're an admin, always allow access
    if (user.role === 'admin') {
      return next();
    }
    
    // Check if they have an active subscription
    if (user.subscription && 
        user.subscription.expiresAt && 
        new Date(user.subscription.expiresAt) > new Date()) {
      return next();
    }
    
    req.flash('error', 'Your subscription has expired. Please renew to access this feature.');
    return res.redirect('/subscription/plans');
  }
  
  req.flash('error', 'Please log in to view this resource');
  res.redirect('/auth/login');
}
