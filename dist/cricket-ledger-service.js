"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CricketLedgerService = void 0;
const uuid_1 = require("uuid");
const excel_utils_1 = require("./utils/excel-utils");
const data_persistence_1 = require("./utils/data-persistence");
class CricketLedgerService {
    constructor() {
        // Load data from disk if available
        this.matches = (0, data_persistence_1.loadMatches)();
        this.users = (0, data_persistence_1.loadUsers)();
        // If no data was loaded, initialize with empty maps
        if (this.matches.size === 0) {
            this.matches = new Map();
        }
        if (this.users.size === 0) {
            this.users = new Map();
        }
        // Initialize transactions map
        this.transactions = new Map();
        // Load existing transactions or create empty map
        // Note: In a real app, you'd also load transactions from persistence
        // this.transactions = loadTransactions();
        if (this.transactions.size === 0) {
            this.transactions = new Map();
        }
    }
    /**
     * Create a new match ledger
     */
    createMatch(matchId, teams) {
        if (this.matches.has(matchId)) {
            throw new Error(`Match with ID ${matchId} already exists`);
        }
        const exposures = {
            teams: {},
            users: {}
        };
        // Initialize team exposures
        teams.forEach(team => {
            exposures.teams[team] = { win: 0, lose: 0 };
        });
        const match = {
            match_id: matchId,
            teams,
            bets: [],
            exposures
        };
        this.matches.set(matchId, match);
        // Save data to disk after creating a match
        this.saveData();
        return match;
    }
    /**
     * Add a user to the system
     */
    addUser(userId, initialBalance = 0) {
        if (this.users.has(userId)) {
            throw new Error(`User with ID ${userId} already exists`);
        }
        const user = {
            id: userId,
            balance: initialBalance
        };
        this.users.set(userId, user);
        // Save data to disk after adding a user
        this.saveData();
        return user;
    }
    /**
     * Add a bet to a match and update exposures
     */
    addBet(matchId, userId, betType, target, stake, odds) {
        // Validate match exists
        const match = this.matches.get(matchId);
        if (!match) {
            throw new Error(`Match with ID ${matchId} does not exist`);
        }
        // Validate user exists
        const user = this.users.get(userId);
        if (!user) {
            throw new Error(`User with ID ${userId} does not exist`);
        }
        // Validate team/target exists
        if (!match.teams.includes(target)) {
            throw new Error(`Target ${target} is not a valid team for this match`);
        }
        // Validate stake and odds
        if (stake <= 0 || odds <= 1) {
            throw new Error('Stake must be positive and odds must be greater than 1');
        }
        // Create bet
        const bet = {
            id: (0, uuid_1.v4)(),
            user_id: userId,
            bet_type: betType,
            target,
            stake,
            odds,
            status: 'confirmed',
            created_at: new Date(),
            reserved_amount: betType === 'back' ? stake : stake * (odds - 1)
        };
        // Add bet to match
        match.bets.push(bet);
        // Update exposures
        this.calculateExposures(match);
        // Save data to disk after adding a bet
        this.saveData();
        return bet;
    }
    /**
     * Update an existing bet
     * @param matchId Match ID that contains the bet
     * @param betId ID of the bet to update
     * @param betType New bet type
     * @param target New target team
     * @param stake New stake amount
     * @param odds New odds
     * @returns The updated bet
     */
    updateBet(matchId, betId, betType, target, stake, odds) {
        // Validate match exists
        const match = this.matches.get(matchId);
        if (!match) {
            throw new Error(`Match with ID ${matchId} does not exist`);
        }
        // Find the bet
        const betIndex = match.bets.findIndex(bet => bet.id === betId);
        if (betIndex === -1) {
            throw new Error(`Bet with ID ${betId} does not exist in this match`);
        }
        const bet = match.bets[betIndex];
        // Can only update confirmed bets
        if (bet.status !== 'confirmed') {
            throw new Error(`Cannot update bet with status ${bet.status}`);
        }
        // Validate team/target exists
        if (!match.teams.includes(target)) {
            throw new Error(`Target ${target} is not a valid team for this match`);
        }
        // Validate stake and odds
        if (stake <= 0 || odds <= 1) {
            throw new Error('Stake must be positive and odds must be greater than 1');
        }
        // Update bet
        match.bets[betIndex] = {
            ...bet,
            bet_type: betType,
            target,
            stake,
            odds,
            reserved_amount: betType === 'back' ? stake : stake * (odds - 1)
        };
        // Update exposures
        this.calculateExposures(match);
        // Save data to disk after updating a bet
        this.saveData();
        return match.bets[betIndex];
    }
    /**
     * Get a bet by ID from a match
     * @param matchId Match ID that contains the bet
     * @param betId ID of the bet to retrieve
     * @returns The bet or undefined if not found
     */
    getBet(matchId, betId) {
        const match = this.matches.get(matchId);
        if (!match) {
            return undefined;
        }
        return match.bets.find(bet => bet.id === betId);
    }
    /**
     * Calculate exposures for a match
     */
    calculateExposures(match) {
        // Reset team exposures
        match.teams.forEach(team => {
            match.exposures.teams[team] = { win: 0, lose: 0 };
        });
        // Reset user exposures
        match.exposures.users = {};
        // Step 1: Calculate raw exposures based on individual bets
        for (const bet of match.bets) {
            if (bet.status !== 'confirmed')
                continue;
            // Initialize user exposure if not exists
            if (!match.exposures.users[bet.user_id]) {
                match.exposures.users[bet.user_id] = {};
                match.teams.forEach(team => {
                    match.exposures.users[bet.user_id][team] = { win: 0, lose: 0 };
                });
            }
            const userExposure = match.exposures.users[bet.user_id];
            if (bet.bet_type === 'back') {
                // BACK BET LOGIC: You win when the backed team wins, lose the stake when it loses
                const profitIfWin = (bet.stake * bet.odds) - bet.stake;
                const lossIfLose = -bet.stake;
                // For the backed team
                userExposure[bet.target].win += profitIfWin;
                userExposure[bet.target].lose += lossIfLose;
                // For other teams
                match.teams.forEach(team => {
                    if (team !== bet.target) {
                        userExposure[team].win += lossIfLose;
                        userExposure[team].lose += profitIfWin;
                    }
                });
            }
            else {
                // LAY BET LOGIC: You win (stake) when the target loses and lose liability when the target wins.
                const profitIfWin = bet.stake; // gain stake if target loses
                const liability = bet.stake * (bet.odds - 1); // potential loss if target wins
                const negativeLiability = -liability; // liability as a negative exposure
                // For the target team
                userExposure[bet.target].win += negativeLiability; // negative if team wins (liability)
                userExposure[bet.target].lose += profitIfWin; // positive if team loses (profit)
                // For other teams
                match.teams.forEach(team => {
                    if (team !== bet.target) {
                        userExposure[team].win += profitIfWin; // positive if other team wins
                        userExposure[team].lose += negativeLiability; // negative if other team loses
                    }
                });
            }
        }
        // Step 2: Aggregate user exposures into team exposures
        match.teams.forEach(team => {
            match.exposures.teams[team] = { win: 0, lose: 0 };
        });
        Object.values(match.exposures.users).forEach(userExposure => {
            match.teams.forEach(team => {
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
            user_exposures: { ...match.exposures.users }
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
        // Process each bet to determine payout
        for (const bet of match.bets) {
            if (bet.status !== 'confirmed')
                continue;
            const user = this.users.get(bet.user_id);
            if (!user)
                continue; // Skip if user not found
            let payout = 0;
            let profit = 0;
            // Back bet on winning team = win
            if (bet.bet_type === 'back' && bet.target === winningTeam) {
                payout = bet.stake * bet.odds;
                profit = payout - bet.stake;
                bet.status = 'won';
                // Record winning bet transaction
                this.addTransaction(bet.user_id, 'bet_won', profit, `Won bet on ${bet.target} (${bet.bet_type}): ${bet.stake} @ ${bet.odds}`, bet.id);
            }
            // Lay bet on losing team = win
            else if (bet.bet_type === 'lay' && bet.target !== winningTeam) {
                payout = bet.stake;
                profit = bet.stake;
                bet.status = 'won';
                // Record winning bet transaction
                this.addTransaction(bet.user_id, 'bet_won', profit, `Won bet against ${bet.target} (${bet.bet_type}): ${bet.stake} @ ${bet.odds}`, bet.id);
            }
            // Back bet on losing team or lay bet on winning team = loss
            else {
                if (bet.bet_type === 'back') {
                    payout = 0;
                    profit = -bet.stake;
                    // Record losing bet transaction
                    this.addTransaction(bet.user_id, 'bet_lost', bet.stake, `Lost bet on ${bet.target} (${bet.bet_type}): ${bet.stake} @ ${bet.odds}`, bet.id);
                }
                else { // 'lay'
                    const liability = bet.stake * (bet.odds - 1);
                    payout = -liability;
                    profit = -liability;
                    // Record losing bet transaction
                    this.addTransaction(bet.user_id, 'bet_lost', liability, `Lost bet against ${bet.target} (${bet.bet_type}): ${bet.stake} @ ${bet.odds}`, bet.id);
                }
                bet.status = 'lost';
            }
            // Update user balance
            user.balance += payout;
        }
        // Save data to disk after settling a match
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
        const userBets = match.bets.filter(bet => bet.user_id === userId);
        const betResults = userBets.map(bet => {
            let payout = 0;
            let profit_or_loss = 0;
            if (bet.status === 'won') {
                if (bet.bet_type === 'back') {
                    payout = bet.stake * bet.odds;
                    profit_or_loss = payout - bet.stake;
                }
                else { // 'lay'
                    payout = bet.stake;
                    profit_or_loss = bet.stake;
                }
            }
            else if (bet.status === 'lost') {
                if (bet.bet_type === 'back') {
                    payout = 0;
                    profit_or_loss = -bet.stake;
                }
                else { // 'lay'
                    payout = 0;
                    profit_or_loss = -bet.stake * (bet.odds - 1);
                }
            }
            else { // 'confirmed' (match not settled yet)
                payout = 0;
                profit_or_loss = 0;
            }
            return {
                target: bet.target,
                bet_type: bet.bet_type,
                status: bet.status,
                stake: bet.stake,
                odds: bet.odds,
                payout,
                profit_or_loss
            };
        });
        const total_profit_or_loss = betResults.reduce((sum, result) => {
            return sum + result.profit_or_loss;
        }, 0);
        return {
            user_id: userId,
            bets: betResults,
            total_profit_or_loss
        };
    }
    /**
     * Save all current data to an Excel file
     * @param filePath Path where the Excel file will be saved
     * @returns The path to the saved file
     */
    saveDataToExcel(filePath) {
        return (0, excel_utils_1.saveDataToExcel)(this.matches, this.users, filePath);
    }
    /**
     * Delete a bet from a match
     * @param matchId Match ID that contains the bet
     * @param betId ID of the bet to delete
     * @returns true if deletion was successful, false otherwise
     */
    deleteBet(matchId, betId) {
        const match = this.matches.get(matchId);
        if (!match) {
            throw new Error(`Match with ID ${matchId} does not exist`);
        }
        const initialLength = match.bets.length;
        match.bets = match.bets.filter(bet => bet.id !== betId);
        if (match.bets.length === initialLength) {
            // No bet was removed
            return false;
        }
        // Recalculate exposures since a bet was removed
        this.calculateExposures(match);
        // Save data to disk after deleting a bet
        this.saveData();
        return true;
    }
    /**
     * Delete a match from the ledger
     * @param matchId ID of the match to delete
     * @returns true if deletion was successful, false otherwise
     */
    deleteMatch(matchId) {
        if (!this.matches.has(matchId)) {
            return false;
        }
        this.matches.delete(matchId);
        // Save data to disk after deleting a match
        this.saveData();
        return true;
    }
    /**
     * Delete a user and all associated bets
     * @param userId ID of the user to delete
     * @returns true if deletion was successful, false otherwise
     */
    deleteUser(userId) {
        if (!this.users.has(userId)) {
            return false;
        }
        // Remove user from users map
        this.users.delete(userId);
        // Remove user's bets from all matches and recalculate exposures
        this.matches.forEach(match => {
            const initialLength = match.bets.length;
            match.bets = match.bets.filter(bet => bet.user_id !== userId);
            if (match.bets.length !== initialLength) {
                // Bets were removed, recalculate exposures
                this.calculateExposures(match);
            }
        });
        // Save data to disk after deleting a user
        this.saveData();
        return true;
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
     * Used for data export operations
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
     * Used for data export operations
     */
    getUsersMap() {
        return this.users;
    }
    /**
     * Save all current data to disk
     */
    saveData() {
        (0, data_persistence_1.saveAllData)(this.matches, this.users);
    }
    /**
     * Update a user's balance directly
     * @param userId User ID
     * @param amount New balance amount (absolute value)
     * @returns Updated user or null if user not found
     */
    updateUserBalance(userId, amount) {
        if (!this.users.has(userId)) {
            return null;
        }
        const user = this.users.get(userId);
        user.balance = amount;
        // Save data to disk after updating balance
        this.saveData();
        return user;
    }
    /**
     * Deposit amount to a user's balance
     * @param userId User ID
     * @param amount Amount to deposit (positive number)
     * @returns Updated user or null if user not found
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
        // Record the transaction
        this.addTransaction(userId, 'deposit', amount, `Deposited ${amount}`);
        // Save data to disk after deposit
        this.saveData();
        return user;
    }
    /**
     * Withdraw amount from a user's balance
     * @param userId User ID
     * @param amount Amount to withdraw (positive number)
     * @returns Updated user or null if user not found or insufficient funds
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
        // Record the transaction
        this.addTransaction(userId, 'withdrawal', amount, `Withdrew ${amount}`);
        // Save data to disk after withdrawal
        this.saveData();
        return user;
    }
    /**
     * Add a transaction record
     * @param userId User ID associated with the transaction
     * @param type Type of transaction
     * @param amount Transaction amount
     * @param description Description of the transaction
     * @param referenceId Optional reference ID (e.g., bet ID)
     * @returns The created transaction
     */
    addTransaction(userId, type, amount, description, referenceId) {
        const transaction = {
            id: (0, uuid_1.v4)(),
            user_id: userId,
            type,
            amount,
            description,
            created_at: new Date(),
            reference_id: referenceId
        };
        this.transactions.set(transaction.id, transaction);
        return transaction;
    }
    /**
     * Get all transactions for a user
     * @param userId User ID
     * @returns Array of transactions for the user
     */
    getUserTransactions(userId) {
        const userTransactions = Array.from(this.transactions.values())
            .filter(transaction => transaction.user_id === userId)
            .sort((a, b) => b.created_at.getTime() - a.created_at.getTime()); // Sort by date, newest first
        return userTransactions;
    }
}
exports.CricketLedgerService = CricketLedgerService;
