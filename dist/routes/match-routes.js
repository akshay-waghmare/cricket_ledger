"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
// Create the router
const router = express_1.default.Router();
// Require authentication for all match routes
router.use(auth_1.ensureAuthenticated);
// Display all matches
router.get('/', (req, res) => {
    const userId = req.user.id;
    const matches = req.ledgerService.getAllMatches()
        .filter((m) => m.user_id === userId);
    res.render('matches/index', { matches });
});
// Display match creation form
router.get('/create', (req, res) => {
    res.render('matches/create');
});
// Handle match creation
router.post('/', (req, res) => {
    const { matchId, teamA, teamB } = req.body;
    try {
        req.ledgerService.createMatch(matchId, [teamA, teamB], req.user.id);
        res.redirect('/matches');
    }
    catch (error) {
        res.render('matches/create', {
            error: error instanceof Error ? error.message : 'An error occurred while creating the match'
        });
    }
});
// Display match details
router.get('/:id', (req, res) => {
    const match = req.ledgerService.getMatch(req.params.id);
    if (!match || match.user_id !== req.user.id) {
        return res.status(404).render('error', { message: 'Match not found' });
    }
    const users = req.ledgerService.getAllUsers();
    res.render('matches/show', { match, users });
});
// Display exposure snapshot
router.get('/:id/exposure', (req, res) => {
    try {
        const match = req.ledgerService.getMatch(req.params.id);
        if (!match || match.user_id !== req.user.id) {
            throw new Error('Match not found');
        }
        const exposures = req.ledgerService.getExposureSnapshot(req.params.id);
        res.render('matches/exposure', { exposures });
    }
    catch (error) {
        res.status(404).render('error', {
            message: error instanceof Error ? error.message : 'Error retrieving exposure data'
        });
    }
});
// Display settle match form
router.get('/:id/settle', (req, res) => {
    const match = req.ledgerService.getMatch(req.params.id);
    if (!match || match.user_id !== req.user.id) {
        return res.status(404).render('error', { message: 'Match not found' });
    }
    res.render('matches/settle', { match });
});
// Handle settle match
router.post('/:id/settle', (req, res) => {
    const { winningTeam } = req.body;
    try {
        const match = req.ledgerService.getMatch(req.params.id);
        if (!match || match.user_id !== req.user.id)
            throw new Error('Match not found');
        req.ledgerService.settleMatch(req.params.id, winningTeam);
        res.redirect(`/matches/${req.params.id}`);
    }
    catch (error) {
        const match = req.ledgerService.getMatch(req.params.id);
        res.render('matches/settle', {
            match,
            error: error instanceof Error ? error.message : 'An error occurred while settling the match'
        });
    }
});
exports.default = router;
