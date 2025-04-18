import fs from 'fs';
import path from 'path';
import { MatchLedger, User } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const MATCHES_FILE = path.join(DATA_DIR, 'matches.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

/**
 * Ensure data directory exists
 */
export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Save matches to disk
 * @param matches Map of match data
 */
export function saveMatches(matches: Map<string, MatchLedger>): void {
  ensureDataDir();
  const matchesData = Array.from(matches.entries());
  fs.writeFileSync(MATCHES_FILE, JSON.stringify(matchesData, null, 2));
}

/**
 * Save users to disk
 * @param users Map of user data
 */
export function saveUsers(users: Map<string, User>): void {
  ensureDataDir();
  const usersData = Array.from(users.entries());
  fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));
}

/**
 * Load matches from disk
 * @returns Map of match data or empty Map if no data found
 */
export function loadMatches(): Map<string, MatchLedger> {
  ensureDataDir();
  
  try {
    if (fs.existsSync(MATCHES_FILE)) {
      const matchesData = JSON.parse(fs.readFileSync(MATCHES_FILE, 'utf8'));
      return new Map(matchesData);
    }
  } catch (error) {
    console.error('Error loading matches:', error);
  }
  
  return new Map();
}

/**
 * Load users from disk
 * @returns Map of user data or empty Map if no data found
 */
export function loadUsers(): Map<string, User> {
  ensureDataDir();
  
  try {
    if (fs.existsSync(USERS_FILE)) {
      const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      return new Map(usersData);
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  
  return new Map();
}

/**
 * Save all data to disk
 * @param matches Map of match data
 * @param users Map of user data
 */
export function saveAllData(matches: Map<string, MatchLedger>, users: Map<string, User>): void {
  saveMatches(matches);
  saveUsers(users);
}

/**
 * Update a user's balance
 * @param userId User ID
 * @param amount New balance amount (absolute value)
 * @returns Updated user or null if user not found
 */
export function updateUserBalance(userId: string, amount: number): User | null {
  const users = loadUsers();
  
  if (!users.has(userId)) {
    return null;
  }
  
  const user = users.get(userId)!;
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
export function depositToUserBalance(userId: string, amount: number): User | null {
  if (amount <= 0) {
    throw new Error('Deposit amount must be positive');
  }
  
  const users = loadUsers();
  
  if (!users.has(userId)) {
    return null;
  }
  
  const user = users.get(userId)!;
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
export function withdrawFromUserBalance(userId: string, amount: number): User | null {
  if (amount <= 0) {
    throw new Error('Withdrawal amount must be positive');
  }
  
  const users = loadUsers();
  
  if (!users.has(userId)) {
    return null;
  }
  
  const user = users.get(userId)!;
  
  if (user.balance < amount) {
    throw new Error('Insufficient funds');
  }
  
  user.balance -= amount;
  
  saveUsers(users);
  return user;
}