import express, { Request, Response } from 'express';
import { ensureAuthenticated } from '../middleware/auth';
import { ManualLedgerEntryInput, ManualLedgerEntryStatus, ManualLedgerEvent } from '../types';

declare global {
  namespace Express {
    interface Request {
      ledgerService: any;
    }
  }
}

const router = express.Router();

const LEDGER_BASE_PATH = '/manual-ledger';

router.use(ensureAuthenticated);

const getOwnerId = (req: Request): string => {
  return (req.user as any).id;
};

const parseTeams = (rawTeams: unknown): string[] => {
  if (typeof rawTeams !== 'string') {
    return [];
  }

  return rawTeams
    .split(',')
    .map((team) => team.trim())
    .filter(Boolean);
};

const parseManualEntryInput = (body: any): ManualLedgerEntryInput => {
  return {
    customer_name: body.customerName,
    market_type: body.marketType,
    market_name: body.marketName,
    selection: body.selection,
    bet_type: body.betType,
    stake: parseFloat(body.stake),
    price: parseFloat(body.price),
    note: body.note,
  };
};

router.get('/', (req: Request, res: Response) => {
  const overview = req.ledgerService.getManualLedgerOverview(getOwnerId(req));
  res.render('manual-ledger/index', {
    title: 'Session Ledger',
    overview,
  });
});

router.get('/reports/consolidated', (req: Request, res: Response) => {
  const overview = req.ledgerService.getManualLedgerOverview(getOwnerId(req));
  res.render('manual-ledger/consolidated', {
    title: 'Session Ledger Consolidated Report',
    overview,
  });
});

router.get('/events/create', (_req: Request, res: Response) => {
  res.render('manual-ledger/create-event', {
    title: 'Create Offline Event',
    formData: null,
  });
});

router.post('/events', (req: Request, res: Response) => {
  try {
    const event = req.ledgerService.createManualEvent(
      req.body.eventName,
      parseTeams(req.body.teams),
      req.body.note,
      getOwnerId(req),
    );
    req.flash('success', 'Offline event created successfully');
    res.redirect(`${LEDGER_BASE_PATH}/events/${event.id}`);
  } catch (error) {
    res.render('manual-ledger/create-event', {
      title: 'Create Offline Event',
      error: error instanceof Error ? error.message : 'Failed to create offline event',
      formData: req.body,
    });
  }
});

router.get('/events/:eventId', (req: Request, res: Response) => {
  try {
    const ownerId = getOwnerId(req);
    const event: ManualLedgerEvent = req.ledgerService.getManualEventForOwner(req.params.eventId, ownerId);
    const summary = req.ledgerService.getManualEventSummary(req.params.eventId, ownerId);
    const entries = [...event.entries].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    res.render('manual-ledger/show-event', {
      title: event.event_name,
      event,
      summary,
      entries,
    });
  } catch (error) {
    res.status(404).render('error', {
      message: error instanceof Error ? error.message : 'Manual event not found',
      title: 'Error',
    });
  }
});

router.post('/events/:eventId/delete', (req: Request, res: Response) => {
  try {
    const deleted = req.ledgerService.deleteManualEvent(req.params.eventId, getOwnerId(req));
    if (!deleted) {
      throw new Error('Manual event not found');
    }

    req.flash('success', 'Offline event deleted successfully');
    res.redirect(LEDGER_BASE_PATH);
  } catch (error) {
    res.status(404).render('error', {
      message: error instanceof Error ? error.message : 'Failed to delete manual event',
      title: 'Error',
    });
  }
});

router.get('/events/:eventId/entries/create', (req: Request, res: Response) => {
  try {
    const event = req.ledgerService.getManualEventForOwner(req.params.eventId, getOwnerId(req));
    // Support query-param pre-fill (from quick-add buttons on show-event page)
    const q = req.query;
    const formData = (q.marketType || q.marketName || q.selection)
      ? { marketType: q.marketType, marketName: q.marketName, selection: q.selection }
      : null;
    res.render('manual-ledger/create-entry', {
      title: 'Add Offline Entry',
      event,
      formData,
    });
  } catch (error) {
    res.status(404).render('error', {
      message: error instanceof Error ? error.message : 'Manual event not found',
      title: 'Error',
    });
  }
});

router.post('/events/:eventId/entries', (req: Request, res: Response) => {
  try {
    req.ledgerService.addManualEntry(
      req.params.eventId,
      getOwnerId(req),
      parseManualEntryInput(req.body),
    );
    req.flash('success', 'Offline entry added successfully');
    res.redirect(`${LEDGER_BASE_PATH}/events/${req.params.eventId}`);
  } catch (error) {
    const event = req.ledgerService.getManualEventForOwner(req.params.eventId, getOwnerId(req));
    res.render('manual-ledger/create-entry', {
      title: 'Add Offline Entry',
      event,
      error: error instanceof Error ? error.message : 'Failed to add offline entry',
      formData: req.body,
    });
  }
});

router.get('/events/:eventId/entries/:entryId/edit', (req: Request, res: Response) => {
  try {
    const ownerId = getOwnerId(req);
    const event = req.ledgerService.getManualEventForOwner(req.params.eventId, ownerId);
    const entry = req.ledgerService.getManualEntry(req.params.eventId, req.params.entryId, ownerId);

    res.render('manual-ledger/edit-entry', {
      title: 'Edit Offline Entry',
      event,
      entry,
    });
  } catch (error) {
    res.status(404).render('error', {
      message: error instanceof Error ? error.message : 'Manual entry not found',
      title: 'Error',
    });
  }
});

router.post('/events/:eventId/entries/:entryId/update', (req: Request, res: Response) => {
  try {
    req.ledgerService.updateManualEntry(
      req.params.eventId,
      req.params.entryId,
      getOwnerId(req),
      parseManualEntryInput(req.body),
    );
    req.flash('success', 'Offline entry updated successfully');
    res.redirect(`${LEDGER_BASE_PATH}/events/${req.params.eventId}`);
  } catch (error) {
    const ownerId = getOwnerId(req);
    const event = req.ledgerService.getManualEventForOwner(req.params.eventId, ownerId);
    const entry = req.ledgerService.getManualEntry(req.params.eventId, req.params.entryId, ownerId);

    res.render('manual-ledger/edit-entry', {
      title: 'Edit Offline Entry',
      event,
      entry: {
        ...entry,
        ...parseManualEntryInput(req.body),
      },
      error: error instanceof Error ? error.message : 'Failed to update offline entry',
    });
  }
});

router.get('/events/:eventId/entries/:entryId/settle', (req: Request, res: Response) => {
  try {
    const ownerId = getOwnerId(req);
    const event = req.ledgerService.getManualEventForOwner(req.params.eventId, ownerId);
    const entry = req.ledgerService.getManualEntry(req.params.eventId, req.params.entryId, ownerId);

    res.render('manual-ledger/settle-entry', {
      title: 'Settle Offline Entry',
      event,
      entry,
    });
  } catch (error) {
    res.status(404).render('error', {
      message: error instanceof Error ? error.message : 'Manual entry not found',
      title: 'Error',
    });
  }
});

router.post('/events/:eventId/entries/:entryId/settle', (req: Request, res: Response) => {
  try {
    const ownerId = getOwnerId(req);

    // Session settlement by actual score
    if (req.body.actualScore !== undefined && req.body.actualScore !== '') {
      const actualScore = parseFloat(req.body.actualScore);
      if (isNaN(actualScore) || actualScore < 0) {
        throw new Error('Actual score must be a valid non-negative number');
      }
      req.ledgerService.settleManualSessionEntry(
        req.params.eventId,
        req.params.entryId,
        ownerId,
        actualScore,
      );
      req.flash('success', `Session settled with actual score ${actualScore}`);
      res.redirect(`${LEDGER_BASE_PATH}/events/${req.params.eventId}`);
      return;
    }

    // Match / manual settlement by status
    const status = req.body.status as ManualLedgerEntryStatus;
    if (!['won', 'lost', 'void'].includes(status)) {
      throw new Error('Please choose a valid settlement status');
    }

    req.ledgerService.settleManualEntry(
      req.params.eventId,
      req.params.entryId,
      ownerId,
      status,
    );
    req.flash('success', 'Offline entry settled successfully');
    res.redirect(`${LEDGER_BASE_PATH}/events/${req.params.eventId}`);
  } catch (error) {
    const ownerId = getOwnerId(req);
    const event = req.ledgerService.getManualEventForOwner(req.params.eventId, ownerId);
    const entry = req.ledgerService.getManualEntry(req.params.eventId, req.params.entryId, ownerId);

    res.render('manual-ledger/settle-entry', {
      title: 'Settle Offline Entry',
      event,
      entry,
      error: error instanceof Error ? error.message : 'Failed to settle offline entry',
    });
  }
});

router.post('/events/:eventId/entries/:entryId/delete', (req: Request, res: Response) => {
  try {
    const deleted = req.ledgerService.deleteManualEntry(
      req.params.eventId,
      req.params.entryId,
      getOwnerId(req),
    );
    if (!deleted) {
      throw new Error('Manual entry not found');
    }

    req.flash('success', 'Offline entry deleted successfully');
    res.redirect(`${LEDGER_BASE_PATH}/events/${req.params.eventId}`);
  } catch (error) {
    res.status(404).render('error', {
      message: error instanceof Error ? error.message : 'Failed to delete manual entry',
      title: 'Error',
    });
  }
});

router.post('/events/:eventId/settle-sessions', (req: Request, res: Response) => {
  try {
    const ownerId = getOwnerId(req);
    const { marketName, actualScore } = req.body;
    const score = parseFloat(actualScore);

    if (!marketName) {
      throw new Error('Market name is required');
    }
    if (isNaN(score) || score < 0) {
      throw new Error('Actual score must be a valid non-negative number');
    }

    const event = req.ledgerService.getManualEventForOwner(req.params.eventId, ownerId);
    const openSessionEntries = event.entries.filter(
      (e: any) => e.market_type === 'session' && e.status === 'open' && e.market_name === marketName,
    );

    if (openSessionEntries.length === 0) {
      throw new Error(`No open session entries found for "${marketName}"`);
    }

    let settled = 0;
    for (const entry of openSessionEntries) {
      req.ledgerService.settleManualSessionEntry(req.params.eventId, entry.id, ownerId, score);
      settled++;
    }

    req.flash('success', `Settled ${settled} entries for "${marketName}" with score ${score}`);
    res.redirect(`${LEDGER_BASE_PATH}/events/${req.params.eventId}`);
  } catch (error) {
    req.flash('error', error instanceof Error ? error.message : 'Failed to settle sessions');
    res.redirect(`${LEDGER_BASE_PATH}/events/${req.params.eventId}`);
  }
});

export default router;
