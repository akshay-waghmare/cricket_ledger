import { CricketLedgerService } from './cricket-ledger-service';

// Example usage of the Cricket Ledger system

// Create a new cricket ledger service
const ledgerService = new CricketLedgerService();

// 1. Create a match ledger
console.log('\n===== Creating a Match =====');
const match = ledgerService.createMatch('match-001', ['India', 'Australia']);
console.log('Match created:', match);

// 2. Add users
console.log('\n===== Adding Users =====');
const user1 = ledgerService.addUser('user-001', 1000);
const user2 = ledgerService.addUser('user-002', 2000);
console.log('User 1:', user1);
console.log('User 2:', user2);

// 3. Add bets and update exposures
console.log('\n===== Adding Bets =====');
// User 1 places a back bet on India
const bet1 = ledgerService.addBet('match-001', 'user-001', 'back', 'India', 100, 2.0);
console.log('Bet 1 added:', bet1);

// User 2 places a lay bet on India
const bet2 = ledgerService.addBet('match-001', 'user-002', 'lay', 'India', 200, 2.0);
console.log('Bet 2 added:', bet2);

// User 1 places a back bet on Australia
const bet3 = ledgerService.addBet('match-001', 'user-001', 'back', 'Australia', 50, 3.0);
console.log('Bet 3 added:', bet3);

// 4. Display exposure snapshot
console.log('\n===== Exposure Snapshot =====');
const exposureSnapshot = ledgerService.getExposureSnapshot('match-001');
console.log('Match Exposures:', JSON.stringify(exposureSnapshot, null, 2));

// 5. Settle the match (assuming India wins)
console.log('\n===== Settling Match (India wins) =====');
ledgerService.settleMatch('match-001', 'India');

// 6. Generate profit/loss report for users
console.log('\n===== Profit/Loss Reports =====');
const user1Report = ledgerService.generateProfitLossReport('match-001', 'user-001');
console.log('User 1 Report:', JSON.stringify(user1Report, null, 2));

const user2Report = ledgerService.generateProfitLossReport('match-001', 'user-002');
console.log('User 2 Report:', JSON.stringify(user2Report, null, 2));

// 7. Check updated user balances
console.log('\n===== Updated User Balances =====');
console.log('User 1 Balance:', ledgerService.getUser('user-001')?.balance);
console.log('User 2 Balance:', ledgerService.getUser('user-002')?.balance);