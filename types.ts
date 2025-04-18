// Data types for the cricket betting ledger

export type BetType = 'back' | 'lay';
export type BetStatus = 'confirmed' | 'won' | 'lost';

export interface TeamExposure {
  win: number;
  lose: number;
}

export interface UserExposure {
  [teamName: string]: TeamExposure;
}

export interface Bet {
  id: string;
  user_id: string;
  bet_type: BetType;
  target: string;
  stake: number;
  odds: number;
  status: BetStatus;
  created_at: Date;
  reserved_amount: number; // Amount reserved for this bet
}

export interface MatchLedger {
  match_id: string;
  user_id?: string; // Owner of the match
  teams: string[];
  bets: Bet[];
  exposures: {
    teams: {
      [teamName: string]: TeamExposure;
    };
    users: {
      [userId: string]: UserExposure;
    };
  };
}

export interface ExposureSnapshot {
  match_id: string;
  team_exposures: {
    [teamName: string]: TeamExposure;
  };
  user_exposures: {
    [userId: string]: UserExposure;
  };
}

export interface User {
  id: string;
  balance: number;
  role?: 'user' | 'admin';
  owner_id?: string; // ID of the account that owns this customer user
}

export interface AuthUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: 'user' | 'admin';
  isActive: boolean;
  createdAt: Date;
  subscription?: {
    plan: 'free' | 'basic' | 'premium';
    expiresAt: Date;
  };
  matchPassword(enteredPassword: string): Promise<boolean>; // Add this method declaration
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'deposit' | 'withdrawal' | 'bet_won' | 'bet_lost';
  amount: number;
  description: string;
  created_at: Date;
  reference_id?: string; // For bet transactions, this would be the bet ID
}

export interface BetResult {
  target: string;
  bet_type: BetType;
  status: BetStatus;
  stake: number;
  odds: number;
  payout: number;
  profit_or_loss: number;
}

export interface ProfitLossReport {
  user_id: string;
  bets: BetResult[];
  total_profit_or_loss: number;
}