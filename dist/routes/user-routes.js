"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
// Display all users
router.get('/', (req, res) => {
    const users = req.ledgerService.getAllUsers();
    res.render('users/index', { users });
});
// Display user creation form
router.get('/create', (req, res) => {
    res.render('users/create');
});
// Handle user creation
router.post('/', (req, res) => {
    const { userId, balance } = req.body;
    try {
        req.ledgerService.addUser(userId, parseFloat(balance) || 0);
        res.redirect('/users');
    }
    catch (error) {
        res.render('users/create', {
            error: error instanceof Error ? error.message : 'An error occurred while creating the user'
        });
    }
});
// Display user details
router.get('/:id', (req, res) => {
    const user = req.ledgerService.getUser(req.params.id);
    if (!user) {
        return res.status(404).render('error', { message: 'User not found' });
    }
    // Find all matches that this user has bet on
    const matches = req.ledgerService.getAllMatches();
    const userMatches = matches.filter((match) => match.bets.some((bet) => bet.user_id === req.params.id));
    res.render('users/show', { user, userMatches });
});
// Display profit/loss report for a user in a match
router.get('/:userId/matches/:matchId/report', (req, res) => {
    try {
        const report = req.ledgerService.generateProfitLossReport(req.params.matchId, req.params.userId);
        const match = req.ledgerService.getMatch(req.params.matchId);
        const user = req.ledgerService.getUser(req.params.userId);
        res.render('users/report', { report, match, user });
    }
    catch (error) {
        res.status(404).render('error', {
            message: error instanceof Error ? error.message : 'Error retrieving profit/loss report'
        });
    }
});
// Handle user deletion
router.post('/delete/:id', (req, res) => {
    const userId = req.params.id;
    try {
        const success = req.ledgerService.deleteUser(userId);
        if (!success) {
            throw new Error('Failed to delete user');
        }
        res.redirect('/users');
    }
    catch (error) {
        res.render('error', {
            message: error instanceof Error ? error.message : 'An error occurred while deleting the user'
        });
    }
});
// Display balance edit form
router.get('/:id/edit-balance', (req, res) => {
    const user = req.ledgerService.getUser(req.params.id);
    if (!user) {
        return res.status(404).render('error', { message: 'User not found' });
    }
    res.render('users/edit-balance', { user });
});
// Handle balance update
router.post('/:id/update-balance', (req, res) => {
    const userId = req.params.id;
    const newBalance = parseFloat(req.body.balance);
    try {
        if (isNaN(newBalance)) {
            throw new Error('Invalid balance amount');
        }
        const user = req.ledgerService.updateUserBalance(userId, newBalance);
        if (!user) {
            throw new Error('User not found');
        }
        req.flash('success', 'Balance updated successfully');
        res.redirect(`/users/${userId}`);
    }
    catch (error) {
        req.flash('error', error instanceof Error ? error.message : 'Failed to update balance');
        res.redirect(`/users/${userId}/edit-balance`);
    }
});
// Display deposit form
router.get('/:id/deposit', (req, res) => {
    const user = req.ledgerService.getUser(req.params.id);
    if (!user) {
        return res.status(404).render('error', { message: 'User not found' });
    }
    res.render('users/deposit', { user });
});
// Handle deposit
router.post('/:id/deposit', (req, res) => {
    const userId = req.params.id;
    const amount = parseFloat(req.body.amount);
    try {
        if (isNaN(amount)) {
            throw new Error('Invalid deposit amount');
        }
        const user = req.ledgerService.depositToUserBalance(userId, amount);
        if (!user) {
            throw new Error('User not found');
        }
        req.flash('success', `Successfully deposited ${amount}`);
        res.redirect(`/users/${userId}`);
    }
    catch (error) {
        req.flash('error', error instanceof Error ? error.message : 'Failed to process deposit');
        res.redirect(`/users/${userId}/deposit`);
    }
});
// Display user withdrawal form
router.get('/:id/withdraw', (req, res) => {
    const user = req.ledgerService.getUser(req.params.id);
    if (!user) {
        return res.status(404).render('error', { message: 'User not found' });
    }
    res.render('users/withdraw', { user });
});
// Handle withdrawal
router.post('/:id/withdraw', (req, res) => {
    const userId = req.params.id;
    const amount = parseFloat(req.body.amount);
    try {
        if (isNaN(amount)) {
            throw new Error('Invalid withdrawal amount');
        }
        const user = req.ledgerService.withdrawFromUserBalance(userId, amount);
        if (!user) {
            throw new Error('User not found');
        }
        req.flash('success', `Successfully withdrew ${amount}`);
        res.redirect(`/users/${userId}`);
    }
    catch (error) {
        req.flash('error', error instanceof Error ? error.message : 'Failed to process withdrawal');
        res.redirect(`/users/${userId}/withdraw`);
    }
});
// Display user transaction history
router.get('/:id/transactions', (req, res) => {
    const userId = req.params.id;
    const user = req.ledgerService.getUser(userId);
    if (!user) {
        return res.status(404).render('error', { message: 'User not found' });
    }
    const transactions = req.ledgerService.getUserTransactions(userId);
    res.render('users/transactions', {
        user,
        transactions,
        title: 'Transaction History'
    });
});
exports.default = router;
