import express, { Request, Response } from 'express';
import { ensureAuthenticated } from '../middleware/auth';
import { ManualLedgerEntry, MatchLedger, User } from '../types';

declare global {
  namespace Express {
    interface Request {
      ledgerService: any;
    }
  }
}

const router = express.Router();

router.use(ensureAuthenticated);

const getOwnedMatch = (req: Request): MatchLedger => {
  const match = req.ledgerService.getMatch(req.params.id);
  if (!match || match.user_id !== req.user!.id) {
    throw new Error('Match not found');
  }
  return match;
};

const getOwnedCustomers = (req: Request): User[] => {
  return req.ledgerService.getAllUsers()
    .filter((user: User) => user.owner_id === req.user!.id);
};

const getSafeRedirectPath = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && /^\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/.test(value)) {
    return value;
  }
  return fallback;
};

const getSessionEntriesForMatch = (req: Request, matchId: string): ManualLedgerEntry[] => {
  const event = req.ledgerService.getManualEventForMatch(matchId, req.user!.id);
  if (!event) {
    return [];
  }

  return [...event.entries]
    .filter((entry: ManualLedgerEntry) => entry.market_type === 'session')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

const buildOpenSessionMarkets = (entries: ManualLedgerEntry[]): Record<string, number> => {
  return entries.reduce<Record<string, number>>((acc, entry) => {
    if (entry.status === 'open') {
      acc[entry.market_name] = (acc[entry.market_name] ?? 0) + 1;
    }
    return acc;
  }, {});
};

router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const matches: MatchLedger[] = req.ledgerService.getAllMatches()
    .filter((m: MatchLedger) => m.user_id === userId);
  res.render('matches/index', { matches });
});

router.get('/create', (_req: Request, res: Response) => {
  res.render('matches/create');
});

router.post('/', (req: Request, res: Response) => {
  const { matchId, teamA, teamB } = req.body;
  try {
    req.ledgerService.createMatch(matchId, [teamA, teamB], req.user!.id);
    res.redirect('/matches');
  } catch (error) {
    res.render('matches/create', {
      error: error instanceof Error ? error.message : 'An error occurred while creating the match',
    });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const match = getOwnedMatch(req);
    const users = getOwnedCustomers(req);
    const sessionEntries = getSessionEntriesForMatch(req, match.match_id);
    const openSessionEntries = sessionEntries.filter((entry) => entry.status === 'open');
    const settledSessionEntries = sessionEntries.filter((entry) => entry.status !== 'open');

    res.render('matches/show', {
      match,
      users,
      sessionEntries,
      sessionSummary: {
        total: sessionEntries.length,
        open: openSessionEntries.length,
        settled: settledSessionEntries.length,
        realized: settledSessionEntries.reduce((sum, entry) => sum + (entry.realized_profit_or_loss ?? 0), 0),
        openRisk: openSessionEntries.reduce((sum, entry) => sum + entry.potential_risk, 0),
        openPotential: openSessionEntries.reduce((sum, entry) => sum + entry.potential_profit, 0),
      },
    });
  } catch (error) {
    res.status(404).render('error', { message: error instanceof Error ? error.message : 'Match not found' });
  }
});

router.post('/:id/session-entries', (req: Request, res: Response) => {
  const fallback = `/bets/create/${req.params.id}#session-entry-card`;

  try {
    const match = getOwnedMatch(req);
    const customers = getOwnedCustomers(req);
    const customer = customers.find((user) => user.id === req.body.customerUserId);
    if (!customer) {
      throw new Error('Please choose a valid customer');
    }

    const event = req.ledgerService.getOrCreateManualEventForMatch(match.match_id, req.user!.id);
    req.ledgerService.addManualEntry(event.id, req.user!.id, {
      customer_name: customer.id,
      market_type: 'session',
      market_name: req.body.marketName,
      selection: req.body.selection,
      bet_type: req.body.betType,
      stake: parseFloat(req.body.stake),
      price: parseFloat(req.body.price),
      note: req.body.note,
    });

    req.flash('success', `Session/fancy entry added for ${customer.id}`);
  } catch (error) {
    req.flash('error', error instanceof Error ? error.message : 'Failed to add session entry');
  }

  res.redirect(getSafeRedirectPath(req.body.redirectTo, fallback));
});

router.get('/:id/exposure', (req: Request, res: Response) => {
  try {
    const match = getOwnedMatch(req);
    const exposures = req.ledgerService.getExposureSnapshot(match.match_id);
    res.render('matches/exposure', { exposures });
  } catch (error) {
    res.status(404).render('error', {
      message: error instanceof Error ? error.message : 'Error retrieving exposure data',
    });
  }
});

router.get('/:id/settle', (req: Request, res: Response) => {
  try {
    const match = getOwnedMatch(req);
    res.render('matches/settle', { match });
  } catch (error) {
    res.status(404).render('error', { message: error instanceof Error ? error.message : 'Match not found' });
  }
});

router.post('/:id/settle', (req: Request, res: Response) => {
  const { winningTeam } = req.body;
  try {
    const match = getOwnedMatch(req);
    req.ledgerService.settleMatch(match.match_id, winningTeam);
    res.redirect(`/matches/${req.params.id}`);
  } catch (error) {
    const match = req.ledgerService.getMatch(req.params.id);
    res.render('matches/settle', {
      match,
      error: error instanceof Error ? error.message : 'An error occurred while settling the match',
    });
  }
});

router.get('/:id/settle-sessions', (req: Request, res: Response) => {
  try {
    const match = getOwnedMatch(req);
    const sessionEntries = getSessionEntriesForMatch(req, match.match_id);
    res.render('matches/settle-sessions', {
      match,
      sessionEntries,
      openSessionMarkets: buildOpenSessionMarkets(sessionEntries),
    });
  } catch (error) {
    res.status(404).render('error', {
      message: error instanceof Error ? error.message : 'Unable to load session settlement',
    });
  }
});

router.post('/:id/settle-sessions', (req: Request, res: Response) => {
  const redirectPath = `/matches/${req.params.id}/settle-sessions`;

  try {
    const match = getOwnedMatch(req);
    const { marketName, actualScore } = req.body;
    const score = parseFloat(actualScore);
    if (!marketName) {
      throw new Error('Market name is required');
    }
    if (isNaN(score) || score < 0) {
      throw new Error('Actual score must be a valid non-negative number');
    }

    const event = req.ledgerService.getManualEventForMatch(match.match_id, req.user!.id);
    if (!event) {
      throw new Error('No session entries found for this match');
    }

    const openEntries = event.entries.filter((entry: ManualLedgerEntry) => {
      return entry.market_type === 'session' && entry.status === 'open' && entry.market_name === marketName;
    });
    if (openEntries.length === 0) {
      throw new Error(`No open session entries found for "${marketName}"`);
    }

    openEntries.forEach((entry) => {
      req.ledgerService.settleManualSessionEntry(event.id, entry.id, req.user!.id, score);
    });

    req.flash('success', `Settled ${openEntries.length} session entries for "${marketName}"`);
  } catch (error) {
    req.flash('error', error instanceof Error ? error.message : 'Failed to settle sessions');
  }

  res.redirect(redirectPath);
});

export default router;
