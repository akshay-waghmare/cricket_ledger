"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.use(auth_1.ensureAuthenticated, auth_1.ensureAdmin);
const getOwnerId = (req) => {
    return req.user.id;
};
const parseTeams = (rawTeams) => {
    if (typeof rawTeams !== 'string') {
        return [];
    }
    return rawTeams
        .split(',')
        .map((team) => team.trim())
        .filter(Boolean);
};
const parseManualEntryInput = (body) => {
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
router.get('/', (req, res) => {
    const overview = req.ledgerService.getManualLedgerOverview(getOwnerId(req));
    res.render('manual-ledger/index', {
        title: 'Offline Manual Ledger',
        overview,
    });
});
router.get('/reports/consolidated', (req, res) => {
    const overview = req.ledgerService.getManualLedgerOverview(getOwnerId(req));
    res.render('manual-ledger/consolidated', {
        title: 'Manual Ledger Consolidated Report',
        overview,
    });
});
router.get('/events/create', (_req, res) => {
    res.render('manual-ledger/create-event', {
        title: 'Create Offline Event',
        formData: null,
    });
});
router.post('/events', (req, res) => {
    try {
        const event = req.ledgerService.createManualEvent(req.body.eventName, parseTeams(req.body.teams), req.body.note, getOwnerId(req));
        req.flash('success', 'Offline event created successfully');
        res.redirect(`/admin/manual-ledger/events/${event.id}`);
    }
    catch (error) {
        res.render('manual-ledger/create-event', {
            title: 'Create Offline Event',
            error: error instanceof Error ? error.message : 'Failed to create offline event',
            formData: req.body,
        });
    }
});
router.get('/events/:eventId', (req, res) => {
    try {
        const ownerId = getOwnerId(req);
        const event = req.ledgerService.getManualEventForOwner(req.params.eventId, ownerId);
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
    }
    catch (error) {
        res.status(404).render('error', {
            message: error instanceof Error ? error.message : 'Manual event not found',
            title: 'Error',
        });
    }
});
router.post('/events/:eventId/delete', (req, res) => {
    try {
        const deleted = req.ledgerService.deleteManualEvent(req.params.eventId, getOwnerId(req));
        if (!deleted) {
            throw new Error('Manual event not found');
        }
        req.flash('success', 'Offline event deleted successfully');
        res.redirect('/admin/manual-ledger');
    }
    catch (error) {
        res.status(404).render('error', {
            message: error instanceof Error ? error.message : 'Failed to delete manual event',
            title: 'Error',
        });
    }
});
router.get('/events/:eventId/entries/create', (req, res) => {
    try {
        const event = req.ledgerService.getManualEventForOwner(req.params.eventId, getOwnerId(req));
        res.render('manual-ledger/create-entry', {
            title: 'Add Offline Entry',
            event,
            formData: null,
        });
    }
    catch (error) {
        res.status(404).render('error', {
            message: error instanceof Error ? error.message : 'Manual event not found',
            title: 'Error',
        });
    }
});
router.post('/events/:eventId/entries', (req, res) => {
    try {
        req.ledgerService.addManualEntry(req.params.eventId, getOwnerId(req), parseManualEntryInput(req.body));
        req.flash('success', 'Offline entry added successfully');
        res.redirect(`/admin/manual-ledger/events/${req.params.eventId}`);
    }
    catch (error) {
        const event = req.ledgerService.getManualEventForOwner(req.params.eventId, getOwnerId(req));
        res.render('manual-ledger/create-entry', {
            title: 'Add Offline Entry',
            event,
            error: error instanceof Error ? error.message : 'Failed to add offline entry',
            formData: req.body,
        });
    }
});
router.get('/events/:eventId/entries/:entryId/edit', (req, res) => {
    try {
        const ownerId = getOwnerId(req);
        const event = req.ledgerService.getManualEventForOwner(req.params.eventId, ownerId);
        const entry = req.ledgerService.getManualEntry(req.params.eventId, req.params.entryId, ownerId);
        res.render('manual-ledger/edit-entry', {
            title: 'Edit Offline Entry',
            event,
            entry,
        });
    }
    catch (error) {
        res.status(404).render('error', {
            message: error instanceof Error ? error.message : 'Manual entry not found',
            title: 'Error',
        });
    }
});
router.post('/events/:eventId/entries/:entryId/update', (req, res) => {
    try {
        req.ledgerService.updateManualEntry(req.params.eventId, req.params.entryId, getOwnerId(req), parseManualEntryInput(req.body));
        req.flash('success', 'Offline entry updated successfully');
        res.redirect(`/admin/manual-ledger/events/${req.params.eventId}`);
    }
    catch (error) {
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
router.get('/events/:eventId/entries/:entryId/settle', (req, res) => {
    try {
        const ownerId = getOwnerId(req);
        const event = req.ledgerService.getManualEventForOwner(req.params.eventId, ownerId);
        const entry = req.ledgerService.getManualEntry(req.params.eventId, req.params.entryId, ownerId);
        res.render('manual-ledger/settle-entry', {
            title: 'Settle Offline Entry',
            event,
            entry,
        });
    }
    catch (error) {
        res.status(404).render('error', {
            message: error instanceof Error ? error.message : 'Manual entry not found',
            title: 'Error',
        });
    }
});
router.post('/events/:eventId/entries/:entryId/settle', (req, res) => {
    try {
        const status = req.body.status;
        if (!['won', 'lost', 'void'].includes(status)) {
            throw new Error('Please choose a valid settlement status');
        }
        req.ledgerService.settleManualEntry(req.params.eventId, req.params.entryId, getOwnerId(req), status);
        req.flash('success', 'Offline entry settled successfully');
        res.redirect(`/admin/manual-ledger/events/${req.params.eventId}`);
    }
    catch (error) {
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
router.post('/events/:eventId/entries/:entryId/delete', (req, res) => {
    try {
        const deleted = req.ledgerService.deleteManualEntry(req.params.eventId, req.params.entryId, getOwnerId(req));
        if (!deleted) {
            throw new Error('Manual entry not found');
        }
        req.flash('success', 'Offline entry deleted successfully');
        res.redirect(`/admin/manual-ledger/events/${req.params.eventId}`);
    }
    catch (error) {
        res.status(404).render('error', {
            message: error instanceof Error ? error.message : 'Failed to delete manual entry',
            title: 'Error',
        });
    }
});
exports.default = router;
