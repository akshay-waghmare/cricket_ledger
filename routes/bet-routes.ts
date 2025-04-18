import express from 'express';
import { Bet } from '../types';

const router = express.Router();

// Add bet form (accessed from match page)
router.get('/create/:matchId', (req, res) => {
  const match = (req as any).ledgerService.getMatch(req.params.matchId);
  if (!match) {
    return res.status(404).render('error', { message: 'Match not found' });
  }
  
  const users = (req as any).ledgerService.getAllUsers();
  res.render('bets/create', { match, users, formData: null });
});

// Display bet edit form
router.get('/edit/:matchId/:betId', (req, res) => {
  const { matchId, betId } = req.params;
  
  const match = (req as any).ledgerService.getMatch(matchId);
  if (!match) {
    return res.status(404).render('error', { message: 'Match not found' });
  }
  
  const bet = (req as any).ledgerService.getBet(matchId, betId);
  if (!bet) {
    return res.status(404).render('error', { message: 'Bet not found' });
  }
  
  // Only confirmed bets can be edited
  if (bet.status !== 'confirmed') {
    return res.render('error', { 
      message: `Cannot edit a bet with status: ${bet.status}. Only confirmed bets can be edited.`
    });
  }
  
  const users = (req as any).ledgerService.getAllUsers();
  res.render('bets/edit', { match, bet, users });
});

// Handle bet creation
router.post('/', (req, res) => {
  const { matchId, userId, betType, target, stake, odds } = req.body;
  
  try {
    (req as any).ledgerService.addBet(
      matchId,
      userId,
      betType,
      target,
      parseFloat(stake),
      parseFloat(odds)
    );
    res.redirect(`/matches/${matchId}`);
  } catch (error) {
    const match = (req as any).ledgerService.getMatch(matchId);
    const users = (req as any).ledgerService.getAllUsers();
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
    (req as any).ledgerService.updateBet(
      matchId,
      betId,
      betType,
      target,
      parseFloat(stake),
      parseFloat(odds)
    );
    res.redirect(`/matches/${matchId}`);
  } catch (error) {
    const match = (req as any).ledgerService.getMatch(matchId);
    const bet = (req as any).ledgerService.getBet(matchId, betId);
    const users = (req as any).ledgerService.getAllUsers();
    
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
    const success = (req as any).ledgerService.deleteBet(matchId, betId);
    if (!success) {
      throw new Error('Failed to delete bet');
    }
    res.redirect(`/matches/${matchId}`);
  } catch (error) {
    res.render('error', { 
      message: error instanceof Error ? error.message : 'An error occurred while deleting the bet'
    });
  }
});

// View all bets (new route to see all bets across matches)
router.get('/', (req, res) => {
  const matches = (req as any).ledgerService.getAllMatches();
  
  // Define the structure of the enhanced bet object with match information
  interface EnhancedBet extends Bet {
    match_id: string;
    teams: string[];
  }
  
  const allBets: EnhancedBet[] = [];
  
  // Collect all bets from all matches
  matches.forEach((match: any) => {
    match.bets.forEach((bet: any) => {
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

export default router;