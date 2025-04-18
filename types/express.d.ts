import { Document } from 'mongoose';
import { AuthUser } from '../models/User';
import { CricketLedgerService } from '../cricket-ledger-service';

declare global {
  namespace Express {
    interface User extends AuthUser {
      id: string;
      matchPassword(password: string): Promise<boolean>;
    }
    
    interface Request {
      user?: User;
      isAuthenticated(): boolean;
      logout(done: (err?: Error) => void): void;
      flash(type: string, message?: any): any;
      ledgerService: CricketLedgerService;
    }
  }
}

// This file is a module
export {};
