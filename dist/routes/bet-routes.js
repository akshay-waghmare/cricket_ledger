"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Require authentication for all bet routes
router.use(auth_1.ensureAuthenticated);
// Add bet form (accessed from match page)
router.get('/create/:matchId', (req, res) => {
    const match = req.ledgerService.getMatch(req.params.matchId);
    if (!match || match.user_id !== req.user.id) {
        return res.status(404).render('error', { message: 'Match not found' });
    }
    const accountId = req.user.id;
    const users = req.ledgerService.getAllUsers()
        .filter((u) => u.owner_id === accountId);
    res.render('bets/create', { match, users, formData: null });
});
// Display bet edit form
router.get('/edit/:matchId/:betId', (req, res) => {
    const { matchId, betId } = req.params;
    const match = req.ledgerService.getMatch(matchId);
    if (!match || match.user_id !== req.user.id) {
        return res.status(404).render('error', { message: 'Match not found' });
    }
    const bet = req.ledgerService.getBet(matchId, betId);
    if (!bet) {
        return res.status(404).render('error', { message: 'Bet not found' });
    }
    // Only confirmed bets can be edited
    if (bet.status !== 'confirmed') {
        return res.render('error', {
            message: `Cannot edit a bet with status: ${bet.status}. Only confirmed bets can be edited.`
        });
    }
    const users = req.ledgerService.getAllUsers()
        .filter((u) => u.owner_id === req.user.id);
    res.render('bets/edit', { match, bet, users });
});
// Handle bet creation
router.post('/', (req, res) => {
    const { matchId, userId, betType, target, stake, odds } = req.body;
    try {
        const match = req.ledgerService.getMatch(matchId);
        if (!match || match.user_id !== req.user.id)
            throw new Error('Match not found');
        req.ledgerService.addBet(matchId, userId, betType, target, parseFloat(stake), parseFloat(odds));
        res.redirect(`/matches/${matchId}`);
    }
    catch (error) {
        const match = req.ledgerService.getMatch(matchId);
        const users = req.ledgerService.getAllUsers();
        res.render('bets/create', {
            match,
            users,
            error: error instanceof Error ? error.message : 'An error occurred while placing the bet',
            formData: req.body
        });
    }
});
// Handle bet update
router.post('/update/:matchId/:betId', (req, res) => {
    const { matchId, betId } = req.params;
    const { betType, target, stake, odds } = req.body;
    try {
        const match = req.ledgerService.getMatch(matchId);
        if (!match || match.user_id !== req.user.id)
            throw new Error('Match not found');
        req.ledgerService.updateBet(matchId, betId, betType, target, parseFloat(stake), parseFloat(odds));
        res.redirect(`/matches/${matchId}`);
    }
    catch (error) {
        const match = req.ledgerService.getMatch(matchId);
        const bet = req.ledgerService.getBet(matchId, betId);
        const users = req.ledgerService.getAllUsers();
        res.render('bets/edit', {
            match,
            bet,
            users,
            error: error instanceof Error ? error.message : 'An error occurred while updating the bet'
        });
    }
});
// Handle bet deletion
router.post('/delete/:matchId/:betId', (req, res) => {
    const { matchId, betId } = req.params;
    try {
        const match = req.ledgerService.getMatch(matchId);
        if (!match || match.user_id !== req.user.id)
            throw new Error('Match not found');
        const success = req.ledgerService.deleteBet(matchId, betId);
        if (!success) {
            throw new Error('Failed to delete bet');
        }
        res.redirect(`/matches/${matchId}`);
    }
    catch (error) {
        res.render('error', {
            message: error instanceof Error ? error.message : 'An error occurred while deleting the bet'
        });
    }
});
// View all bets (new route to see all bets across matches)
router.get('/', (req, res) => {
    const userId = req.user.id;
    const matches = req.ledgerService.getAllMatches()
        .filter((m) => m.user_id === userId);
    const allBets = [];
    matches.forEach((match) => {
        match.bets.forEach((bet) => {
            allBets.push({
                ...bet,
                match_id: match.match_id,
                teams: match.teams
            });
        });
    });
    // Sort bets by creation date (newest first)
    allBets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.render('bets/index', { bets: allBets });
});
exports.default = router;
