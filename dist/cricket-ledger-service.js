"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CricketLedgerService = void 0;
const uuid_1 = require("uuid");
const excel_utils_1 = require("./utils/excel-utils");
const data_persistence_1 = require("./utils/data-persistence");
class CricketLedgerService {
    constructor() {
        this.matches = (0, data_persistence_1.loadMatches)();
        this.users = (0, data_persistence_1.loadUsers)();
        this.manualLedgerEvents = (0, data_persistence_1.loadManualLedgerEvents)();
        if (this.matches.size === 0) {
            this.matches = new Map();
        }
        if (this.users.size === 0) {
            this.users = new Map();
        }
        if (this.manualLedgerEvents.size === 0) {
            this.manualLedgerEvents = new Map();
        }
        this.transactions = new Map();
        if (this.transactions.size === 0) {
            this.transactions = new Map();
        }
    }
    /**
     * Create a new match ledger
     */
    createMatch(matchId, teams, userId) {
        if (this.matches.has(matchId)) {
            throw new Error(`Match with ID ${matchId} already exists`);
        }
        const exposures = {
            teams: {},
            users: {},
        };
        teams.forEach((team) => {
            exposures.teams[team] = { win: 0, lose: 0 };
        });
        const match = {
            match_id: matchId,
            user_id: userId,
            teams,
            bets: [],
            exposures,
        };
        this.matches.set(matchId, match);
        this.saveData();
        return match;
    }
    /**
     * Add a user to the system
     */
    addUser(userId, initialBalance = 0, ownerId) {
        if (this.users.has(userId)) {
            throw new Error(`User with ID ${userId} already exists`);
        }
        const user = {
            id: userId,
            balance: initialBalance,
            owner_id: ownerId,
        };
        this.users.set(userId, user);
        this.saveData();
        return user;
    }
    /**
     * Add a bet to a match and update exposures
     */
    addBet(matchId, userId, betType, target, stake, odds) {
        const match = this.matches.get(matchId);
        if (!match) {
            throw new Error(`Match with ID ${matchId} does not exist`);
        }
        const user = this.users.get(userId);
        if (!user) {
            throw new Error(`User with ID ${userId} does not exist`);
        }
        if (!match.teams.includes(target)) {
            throw new Error(`Target ${target} is not a valid team for this match`);
        }
        if (stake <= 0 || odds <= 1) {
            throw new Error('Stake must be positive and odds must be greater than 1');
        }
        const bet = {
            id: (0, uuid_1.v4)(),
            user_id: userId,
            bet_type: betType,
            target,
            stake,
            odds,
            status: 'confirmed',
            created_at: new Date(),
            reserved_amount: betType === 'back' ? stake : stake * (odds - 1),
        };
        match.bets.push(bet);
        this.calculateExposures(match);
        this.saveData();
        return bet;
    }
    /**
     * Update an existing bet
     */
    updateBet(matchId, betId, betType, target, stake, odds) {
        const match = this.matches.get(matchId);
        if (!match) {
            throw new Error(`Match with ID ${matchId} does not exist`);
        }
        const betIndex = match.bets.findIndex((bet) => bet.id === betId);
        if (betIndex === -1) {
            throw new Error(`Bet with ID ${betId} does not exist in this match`);
        }
        const bet = match.bets[betIndex];
        if (bet.status !== 'confirmed') {
            throw new Error(`Cannot update bet with status ${bet.status}`);
        }
        if (!match.teams.includes(target)) {
            throw new Error(`Target ${target} is not a valid team for this match`);
        }
        if (stake <= 0 || odds <= 1) {
            throw new Error('Stake must be positive and odds must be greater than 1');
        }
        match.bets[betIndex] = {
            ...bet,
            bet_type: betType,
            target,
            stake,
            odds,
            reserved_amount: betType === 'back' ? stake : stake * (odds - 1),
        };
        this.calculateExposures(match);
        this.saveData();
        return match.bets[betIndex];
    }
    /**
     * Get a bet by ID from a match
     */
    getBet(matchId, betId) {
        const match = this.matches.get(matchId);
        if (!match) {
            return undefined;
        }
        return match.bets.find((bet) => bet.id === betId);
    }
    /**
     * Calculate exposures for a match
     */
    calculateExposures(match) {
        match.teams.forEach((team) => {
            match.exposures.teams[team] = { win: 0, lose: 0 };
        });
        match.exposures.users = {};
        for (const bet of match.bets) {
            if (bet.status !== 'confirmed')
                continue;
            if (!match.exposures.users[bet.user_id]) {
                match.exposures.users[bet.user_id] = {};
                match.teams.forEach((team) => {
                    match.exposures.users[bet.user_id][team] = { win: 0, lose: 0 };
                });
            }
            const userExposure = match.exposures.users[bet.user_id];
            if (bet.bet_type === 'back') {
                const profitIfWin = (bet.stake * bet.odds) - bet.stake;
                const lossIfLose = -bet.stake;
                userExposure[bet.target].win += profitIfWin;
                userExposure[bet.target].lose += lossIfLose;
                match.teams.forEach((team) => {
                    if (team !== bet.target) {
                        userExposure[team].win += lossIfLose;
                        userExposure[team].lose += profitIfWin;
                    }
                });
            }
            else {
                const profitIfWin = bet.stake;
                const liability = bet.stake * (bet.odds - 1);
                const negativeLiability = -liability;
                userExposure[bet.target].win += negativeLiability;
                userExposure[bet.target].lose += profitIfWin;
                match.teams.forEach((team) => {
                    if (team !== bet.target) {
                        userExposure[team].win += profitIfWin;
                        userExposure[team].lose += negativeLiability;
                    }
                });
            }
        }
        match.teams.forEach((team) => {
            match.exposures.teams[team] = { win: 0, lose: 0 };
        });
        Object.values(match.exposures.users).forEach((userExposure) => {
            match.teams.forEach((team) => {
                match.exposures.teams[team].win += userExposure[team].win;
                match.exposures.teams[team].lose += userExposure[team].lose;
            });
        });
    }
    /**
     * Get exposure snapshot for a match
     */
    getExposureSnapshot(matchId) {
        const match = this.matches.get(matchId);
        if (!match) {
            throw new Error(`Match with ID ${matchId} does not exist`);
        }
        return {
            match_id: match.match_id,
            team_exposures: { ...match.exposures.teams },
            user_exposures: { ...match.exposures.users },
        };
    }
    /**
     * Settle bets after a match is completed
     */
    settleMatch(matchId, winningTeam) {
        const match = this.matches.get(matchId);
        if (!match) {
            throw new Error(`Match with ID ${matchId} does not exist`);
        }
        if (!match.teams.includes(winningTeam)) {
            throw new Error(`${winningTeam} is not a valid team for this match`);
        }
        for (const bet of match.bets) {
            if (bet.status !== 'confirmed')
                continue;
            const user = this.users.get(bet.user_id);
            if (!user)
                continue;
            let payout = 0;
            let profit = 0;
            if (bet.bet_type === 'back' && bet.target === winningTeam) {
                payout = bet.stake * bet.odds;
                profit = payout - bet.stake;
                bet.status = 'won';
                this.addTransaction(bet.user_id, 'bet_won', profit, `Won bet on ${bet.target} (${bet.bet_type}): ${bet.stake} @ ${bet.odds}`, bet.id);
            }
            else if (bet.bet_type === 'lay' && bet.target !== winningTeam) {
                payout = bet.stake;
                profit = bet.stake;
                bet.status = 'won';
                this.addTransaction(bet.user_id, 'bet_won', profit, `Won bet against ${bet.target} (${bet.bet_type}): ${bet.stake} @ ${bet.odds}`, bet.id);
            }
            else {
                if (bet.bet_type === 'back') {
                    payout = 0;
                    profit = -bet.stake;
                    this.addTransaction(bet.user_id, 'bet_lost', bet.stake, `Lost bet on ${bet.target} (${bet.bet_type}): ${bet.stake} @ ${bet.odds}`, bet.id);
                }
                else {
                    const liability = bet.stake * (bet.odds - 1);
                    payout = -liability;
                    profit = -liability;
                    this.addTransaction(bet.user_id, 'bet_lost', liability, `Lost bet against ${bet.target} (${bet.bet_type}): ${bet.stake} @ ${bet.odds}`, bet.id);
                }
                bet.status = 'lost';
            }
            user.balance += payout;
        }
        this.saveData();
    }
    /**
     * Generate profit/loss report for a user in a specific match
     */
    generateProfitLossReport(matchId, userId) {
        const match = this.matches.get(matchId);
        if (!match) {
            throw new Error(`Match with ID ${matchId} does not exist`);
        }
        const user = this.users.get(userId);
        if (!user) {
            throw new Error(`User with ID ${userId} does not exist`);
        }
        const userBets = match.bets.filter((bet) => bet.user_id === userId);
        const betResults = userBets.map((bet) => {
            let payout = 0;
            let profit_or_loss = 0;
            if (bet.status === 'won') {
                if (bet.bet_type === 'back') {
                    payout = bet.stake * bet.odds;
                    profit_or_loss = payout - bet.stake;
                }
                else {
                    payout = bet.stake;
                    profit_or_loss = bet.stake;
                }
            }
            else if (bet.status === 'lost') {
                if (bet.bet_type === 'back') {
                    payout = 0;
                    profit_or_loss = -bet.stake;
                }
                else {
                    payout = 0;
                    profit_or_loss = -bet.stake * (bet.odds - 1);
                }
            }
            return {
                target: bet.target,
                bet_type: bet.bet_type,
                status: bet.status,
                stake: bet.stake,
                odds: bet.odds,
                payout,
                profit_or_loss,
            };
        });
        const total_profit_or_loss = betResults.reduce((sum, result) => {
            return sum + result.profit_or_loss;
        }, 0);
        return {
            user_id: userId,
            bets: betResults,
            total_profit_or_loss,
        };
    }
    /**
     * Save all current data to an Excel file
     */
    saveDataToExcel(filePath) {
        return (0, excel_utils_1.saveDataToExcel)(this.matches, this.users, filePath);
    }
    /**
     * Delete a bet from a match
     */
    deleteBet(matchId, betId) {
        const match = this.matches.get(matchId);
        if (!match) {
            throw new Error(`Match with ID ${matchId} does not exist`);
        }
        const initialLength = match.bets.length;
        match.bets = match.bets.filter((bet) => bet.id !== betId);
        if (match.bets.length === initialLength) {
            return false;
        }
        this.calculateExposures(match);
        this.saveData();
        return true;
    }
    /**
     * Delete a match from the ledger
     */
    deleteMatch(matchId) {
        if (!this.matches.has(matchId)) {
            return false;
        }
        this.matches.delete(matchId);
        this.saveData();
        return true;
    }
    /**
     * Delete a user and all associated bets
     */
    deleteUser(userId) {
        if (!this.users.has(userId)) {
            return false;
        }
        this.users.delete(userId);
        this.matches.forEach((match) => {
            const initialLength = match.bets.length;
            match.bets = match.bets.filter((bet) => bet.user_id !== userId);
            if (match.bets.length !== initialLength) {
                this.calculateExposures(match);
            }
        });
        this.saveData();
        return true;
    }
    /**
     * Create a new manual offline event for admin tracking
     */
    createManualEvent(eventName, teams, note, ownerId) {
        const normalizedName = eventName.trim();
        if (!normalizedName) {
            throw new Error('Event name is required');
        }
        const normalizedTeams = teams.map((team) => team.trim()).filter(Boolean);
        const now = new Date();
        const event = {
            id: (0, uuid_1.v4)(),
            owner_id: ownerId,
            event_name: normalizedName,
            teams: normalizedTeams,
            note: note?.trim() || undefined,
            status: 'open',
            entries: [],
            created_at: now,
            updated_at: now,
        };
        this.manualLedgerEvents.set(event.id, event);
        this.saveData();
        return event;
    }
    /**
     * Get one manual event owned by a specific admin
     */
    getManualEventForOwner(eventId, ownerId) {
        return this.requireOwnedManualEvent(eventId, ownerId);
    }
    /**
     * Get all manual events, optionally filtered by owner
     */
    getAllManualEvents(ownerId) {
        const events = Array.from(this.manualLedgerEvents.values());
        const filtered = ownerId ? events.filter((event) => event.owner_id === ownerId) : events;
        return filtered.sort((a, b) => {
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
    }
    /**
     * Add a manual offline entry to an event
     */
    addManualEntry(eventId, ownerId, input) {
        const event = this.requireOwnedManualEvent(eventId, ownerId);
        const normalizedInput = this.normalizeManualEntryInput(input);
        const position = this.calculateManualPosition(normalizedInput.market_type, normalizedInput.bet_type, normalizedInput.stake, normalizedInput.price);
        const entry = {
            id: (0, uuid_1.v4)(),
            event_id: event.id,
            ...normalizedInput,
            status: 'open',
            created_at: new Date(),
            potential_profit: position.profit,
            potential_risk: position.risk,
        };
        event.entries.push(entry);
        this.refreshManualEvent(event);
        this.saveData();
        return entry;
    }
    /**
     * Update an existing manual offline entry
     */
    updateManualEntry(eventId, entryId, ownerId, input) {
        const event = this.requireOwnedManualEvent(eventId, ownerId);
        const entry = this.requireManualEntry(event, entryId);
        if (entry.status !== 'open') {
            throw new Error('Only open manual entries can be edited');
        }
        const normalizedInput = this.normalizeManualEntryInput(input);
        const position = this.calculateManualPosition(normalizedInput.market_type, normalizedInput.bet_type, normalizedInput.stake, normalizedInput.price);
        entry.customer_name = normalizedInput.customer_name;
        entry.market_type = normalizedInput.market_type;
        entry.market_name = normalizedInput.market_name;
        entry.selection = normalizedInput.selection;
        entry.bet_type = normalizedInput.bet_type;
        entry.stake = normalizedInput.stake;
        entry.price = normalizedInput.price;
        entry.note = normalizedInput.note;
        entry.potential_profit = position.profit;
        entry.potential_risk = position.risk;
        this.refreshManualEvent(event);
        this.saveData();
        return entry;
    }
    /**
     * Get one manual entry owned by a specific admin
     */
    getManualEntry(eventId, entryId, ownerId) {
        const event = this.requireOwnedManualEvent(eventId, ownerId);
        return this.requireManualEntry(event, entryId);
    }
    /**
     * Settle a manual offline entry
     */
    settleManualEntry(eventId, entryId, ownerId, status) {
        const event = this.requireOwnedManualEvent(eventId, ownerId);
        const entry = this.requireManualEntry(event, entryId);
        entry.status = status;
        entry.settled_at = new Date();
        entry.realized_profit_or_loss = this.calculateManualRealizedProfit(entry, status);
        this.refreshManualEvent(event);
        this.saveData();
        return entry;
    }
    /**
     * Delete a manual offline entry
     */
    deleteManualEntry(eventId, entryId, ownerId) {
        const event = this.requireOwnedManualEvent(eventId, ownerId);
        const initialLength = event.entries.length;
        event.entries = event.entries.filter((entry) => entry.id !== entryId);
        if (event.entries.length === initialLength) {
            return false;
        }
        this.refreshManualEvent(event);
        this.saveData();
        return true;
    }
    /**
     * Delete a manual offline event
     */
    deleteManualEvent(eventId, ownerId) {
        const event = this.manualLedgerEvents.get(eventId);
        if (!event || event.owner_id !== ownerId) {
            return false;
        }
        this.manualLedgerEvents.delete(eventId);
        this.saveData();
        return true;
    }
    /**
     * Build a summary for one manual event
     */
    getManualEventSummary(eventId, ownerId) {
        const event = this.requireOwnedManualEvent(eventId, ownerId);
        return this.buildManualEventSummary(event);
    }
    /**
     * Build a consolidated overview for all manual events owned by an admin
     */
    getManualLedgerOverview(ownerId) {
        const events = this.getAllManualEvents(ownerId).map((event) => this.buildManualEventSummary(event));
        return {
            totals: {
                event_count: events.length,
                open_event_count: events.filter((event) => event.status === 'open').length,
                entry_count: events.reduce((sum, event) => sum + event.entry_count, 0),
                open_entry_count: events.reduce((sum, event) => sum + event.open_entry_count, 0),
                realized_profit_or_loss: this.roundAmount(events.reduce((sum, event) => sum + event.realized_profit_or_loss, 0)),
                open_potential_profit: this.roundAmount(events.reduce((sum, event) => sum + event.open_potential_profit, 0)),
                open_risk: this.roundAmount(events.reduce((sum, event) => sum + event.open_risk, 0)),
            },
            events,
        };
    }
    /**
     * Get a match by ID
     */
    getMatch(matchId) {
        return this.matches.get(matchId);
    }
    /**
     * Get a user by ID
     */
    getUser(userId) {
        return this.users.get(userId);
    }
    /**
     * Get all matches
     */
    getAllMatches() {
        return Array.from(this.matches.values());
    }
    /**
     * Get the internal matches Map
     */
    getMatchesMap() {
        return this.matches;
    }
    /**
     * Get all users
     */
    getAllUsers() {
        return Array.from(this.users.values());
    }
    /**
     * Get the internal users Map
     */
    getUsersMap() {
        return this.users;
    }
    /**
     * Save all current data to disk
     */
    saveData() {
        (0, data_persistence_1.saveAllData)(this.matches, this.users, this.manualLedgerEvents);
    }
    /**
     * Update a user's balance directly
     */
    updateUserBalance(userId, amount) {
        if (!this.users.has(userId)) {
            return null;
        }
        const user = this.users.get(userId);
        user.balance = amount;
        this.saveData();
        return user;
    }
    /**
     * Deposit amount to a user's balance
     */
    depositToUserBalance(userId, amount) {
        if (amount <= 0) {
            throw new Error('Deposit amount must be positive');
        }
        if (!this.users.has(userId)) {
            return null;
        }
        const user = this.users.get(userId);
        user.balance += amount;
        this.addTransaction(userId, 'deposit', amount, `Deposited ${amount}`);
        this.saveData();
        return user;
    }
    /**
     * Withdraw amount from a user's balance
     */
    withdrawFromUserBalance(userId, amount) {
        if (amount <= 0) {
            throw new Error('Withdrawal amount must be positive');
        }
        if (!this.users.has(userId)) {
            return null;
        }
        const user = this.users.get(userId);
        if (user.balance < amount) {
            throw new Error('Insufficient funds');
        }
        user.balance -= amount;
        this.addTransaction(userId, 'withdrawal', amount, `Withdrew ${amount}`);
        this.saveData();
        return user;
    }
    /**
     * Get all transactions for a user
     */
    getUserTransactions(userId) {
        return Array.from(this.transactions.values())
            .filter((transaction) => transaction.user_id === userId)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    addTransaction(userId, type, amount, description, referenceId) {
        const transaction = {
            id: (0, uuid_1.v4)(),
            user_id: userId,
            type,
            amount,
            description,
            created_at: new Date(),
            reference_id: referenceId,
        };
        this.transactions.set(transaction.id, transaction);
        return transaction;
    }
    requireOwnedManualEvent(eventId, ownerId) {
        const event = this.manualLedgerEvents.get(eventId);
        if (!event || event.owner_id !== ownerId) {
            throw new Error('Manual event not found');
        }
        return event;
    }
    requireManualEntry(event, entryId) {
        const entry = event.entries.find((candidate) => candidate.id === entryId);
        if (!entry) {
            throw new Error('Manual entry not found');
        }
        return entry;
    }
    normalizeManualEntryInput(input) {
        const customerName = input.customer_name?.trim();
        const marketName = input.market_name?.trim();
        const selection = input.selection?.trim();
        const note = input.note?.trim() || undefined;
        if (!customerName) {
            throw new Error('Customer name is required');
        }
        if (!marketName) {
            throw new Error('Market name is required');
        }
        if (!selection) {
            throw new Error('Selection is required');
        }
        if (input.stake <= 0) {
            throw new Error('Stake must be greater than 0');
        }
        if (input.market_type === 'match' && input.price <= 1) {
            throw new Error('Match price must be greater than 1');
        }
        if (input.market_type === 'session' && input.price <= 0) {
            throw new Error('Session rate must be greater than 0');
        }
        return {
            customer_name: customerName,
            market_type: input.market_type,
            market_name: marketName,
            selection,
            bet_type: input.bet_type,
            stake: this.roundAmount(input.stake),
            price: this.roundAmount(input.price),
            note,
        };
    }
    calculateManualPosition(marketType, betType, stake, price) {
        if (marketType === 'match') {
            if (betType === 'back') {
                return {
                    profit: this.roundAmount(stake * (price - 1)),
                    risk: this.roundAmount(stake),
                };
            }
            return {
                profit: this.roundAmount(stake),
                risk: this.roundAmount(stake * (price - 1)),
            };
        }
        if (betType === 'back') {
            return {
                profit: this.roundAmount((stake * price) / 100),
                risk: this.roundAmount(stake),
            };
        }
        return {
            profit: this.roundAmount(stake),
            risk: this.roundAmount((stake * price) / 100),
        };
    }
    calculateManualRealizedProfit(entry, status) {
        if (status === 'won') {
            return entry.potential_profit;
        }
        if (status === 'lost') {
            return this.roundAmount(-entry.potential_risk);
        }
        return 0;
    }
    refreshManualEvent(event) {
        event.status = event.entries.length > 0 && event.entries.every((entry) => entry.status !== 'open')
            ? 'settled'
            : 'open';
        event.updated_at = new Date();
    }
    buildManualEventSummary(event) {
        const openEntries = event.entries.filter((entry) => entry.status === 'open');
        const settledEntries = event.entries.filter((entry) => entry.status !== 'open');
        return {
            event_id: event.id,
            event_name: event.event_name,
            teams: event.teams,
            status: event.status,
            entry_count: event.entries.length,
            open_entry_count: openEntries.length,
            settled_entry_count: settledEntries.length,
            realized_profit_or_loss: this.roundAmount(settledEntries.reduce((sum, entry) => sum + (entry.realized_profit_or_loss ?? 0), 0)),
            open_potential_profit: this.roundAmount(openEntries.reduce((sum, entry) => sum + entry.potential_profit, 0)),
            open_risk: this.roundAmount(openEntries.reduce((sum, entry) => sum + entry.potential_risk, 0)),
            updated_at: event.updated_at,
        };
    }
    roundAmount(value) {
        return Math.round(value * 100) / 100;
    }
}
exports.CricketLedgerService = CricketLedgerService;
