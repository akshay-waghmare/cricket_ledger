"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDataDir = ensureDataDir;
exports.saveMatches = saveMatches;
exports.saveUsers = saveUsers;
exports.saveManualLedgerEvents = saveManualLedgerEvents;
exports.loadMatches = loadMatches;
exports.loadUsers = loadUsers;
exports.loadManualLedgerEvents = loadManualLedgerEvents;
exports.saveAllData = saveAllData;
exports.updateUserBalance = updateUserBalance;
exports.depositToUserBalance = depositToUserBalance;
exports.withdrawFromUserBalance = withdrawFromUserBalance;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), 'data');
const MATCHES_FILE = path_1.default.join(DATA_DIR, 'matches.json');
const USERS_FILE = path_1.default.join(DATA_DIR, 'users.json');
const MANUAL_LEDGER_FILE = path_1.default.join(DATA_DIR, 'manual-ledger-events.json');
/**
 * Ensure data directory exists
 */
function ensureDataDir() {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
}
/**
 * Save matches to disk
 * @param matches Map of match data
 */
function saveMatches(matches) {
    ensureDataDir();
    const matchesData = Array.from(matches.entries());
    fs_1.default.writeFileSync(MATCHES_FILE, JSON.stringify(matchesData, null, 2));
}
/**
 * Save users to disk
 * @param users Map of user data
 */
function saveUsers(users) {
    ensureDataDir();
    const usersData = Array.from(users.entries());
    fs_1.default.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));
}
/**
 * Save manual ledger events to disk
 * @param events Map of manual ledger event data
 */
function saveManualLedgerEvents(events) {
    ensureDataDir();
    const eventsData = Array.from(events.entries());
    fs_1.default.writeFileSync(MANUAL_LEDGER_FILE, JSON.stringify(eventsData, null, 2));
}
/**
 * Load matches from disk
 * @returns Map of match data or empty Map if no data found
 */
function loadMatches() {
    ensureDataDir();
    try {
        if (fs_1.default.existsSync(MATCHES_FILE)) {
            const matchesData = JSON.parse(fs_1.default.readFileSync(MATCHES_FILE, 'utf8'));
            return new Map(matchesData);
        }
    }
    catch (error) {
        console.error('Error loading matches:', error);
    }
    return new Map();
}
/**
 * Load users from disk
 * @returns Map of user data or empty Map if no data found
 */
function loadUsers() {
    ensureDataDir();
    try {
        if (fs_1.default.existsSync(USERS_FILE)) {
            const usersData = JSON.parse(fs_1.default.readFileSync(USERS_FILE, 'utf8'));
            return new Map(usersData);
        }
    }
    catch (error) {
        console.error('Error loading users:', error);
    }
    return new Map();
}
/**
 * Load manual ledger events from disk
 * @returns Map of manual ledger data or empty Map if no data found
 */
function loadManualLedgerEvents() {
    ensureDataDir();
    try {
        if (fs_1.default.existsSync(MANUAL_LEDGER_FILE)) {
            const eventsData = JSON.parse(fs_1.default.readFileSync(MANUAL_LEDGER_FILE, 'utf8'));
            return new Map(eventsData);
        }
    }
    catch (error) {
        console.error('Error loading manual ledger events:', error);
    }
    return new Map();
}
/**
 * Save all data to disk
 * @param matches Map of match data
 * @param users Map of user data
 * @param manualLedgerEvents Map of manual ledger event data
 */
function saveAllData(matches, users, manualLedgerEvents) {
    saveMatches(matches);
    saveUsers(users);
    saveManualLedgerEvents(manualLedgerEvents);
}
/**
 * Update a user's balance
 * @param userId User ID
 * @param amount New balance amount (absolute value)
 * @returns Updated user or null if user not found
 */
function updateUserBalance(userId, amount) {
    const users = loadUsers();
    if (!users.has(userId)) {
        return null;
    }
    const user = users.get(userId);
    user.balance = amount;
    saveUsers(users);
    return user;
}
/**
 * Deposit amount to a user's balance
 * @param userId User ID
 * @param amount Amount to deposit (positive number)
 * @returns Updated user or null if user not found
 */
function depositToUserBalance(userId, amount) {
    if (amount <= 0) {
        throw new Error('Deposit amount must be positive');
    }
    const users = loadUsers();
    if (!users.has(userId)) {
        return null;
    }
    const user = users.get(userId);
    user.balance += amount;
    saveUsers(users);
    return user;
}
/**
 * Withdraw amount from a user's balance
 * @param userId User ID
 * @param amount Amount to withdraw (positive number)
 * @returns Updated user or null if user not found or insufficient funds
 */
function withdrawFromUserBalance(userId, amount) {
    if (amount <= 0) {
        throw new Error('Withdrawal amount must be positive');
    }
    const users = loadUsers();
    if (!users.has(userId)) {
        return null;
    }
    const user = users.get(userId);
    if (user.balance < amount) {
        throw new Error('Insufficient funds');
    }
    user.balance -= amount;
    saveUsers(users);
    return user;
}
