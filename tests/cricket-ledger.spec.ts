/**
 * Comprehensive Jest tests for CricketLedgerService.
 *
 * Covers:
 * 1. Core match/user/bet CRUD
 * 2. Exposure calculation
 * 3. Match settlement & P/L reports
 * 4. Manual ledger event CRUD
 * 5. Manual ledger entry CRUD & validation
 * 6. Manual ledger settlement (won/lost/void/re-settle)
 * 7. Event summary & consolidated overview
 * 8. Owner isolation
 * 9. Persistence round-trip
 * 10. Edge cases & math verification
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

let TEMP_DIR: string;
let origCwd: string;

beforeAll(() => {
  origCwd = process.cwd();
  TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-jest-'));
  process.chdir(TEMP_DIR);
});

afterAll(() => {
  process.chdir(origCwd);
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// Fresh import after chdir so persistence goes to temp dir
import { CricketLedgerService } from '../cricket-ledger-service';

function round(v: number) {
  return Math.round(v * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// 1. Core match/user/bet CRUD
// ═══════════════════════════════════════════════════════════════
describe('Core match/user/bet CRUD', () => {
  let svc: CricketLedgerService;

  beforeEach(() => {
    svc = new CricketLedgerService();
  });

  test('createMatch stores teams and returns correct id', () => {
    const match = svc.createMatch('m1', ['India', 'Australia'], 'owner1');
    expect(match.match_id).toBe('m1');
    expect(match.teams).toEqual(['India', 'Australia']);
    expect(match.bets).toHaveLength(0);
  });

  test('duplicate match throws', () => {
    svc.createMatch('m1', ['A', 'B']);
    expect(() => svc.createMatch('m1', ['C', 'D'])).toThrow('already exists');
  });

  test('addUser stores id and balance', () => {
    const user = svc.addUser('u1', 500, 'owner1');
    expect(user.id).toBe('u1');
    expect(user.balance).toBe(500);
  });

  test('duplicate user throws', () => {
    svc.addUser('u1', 100);
    expect(() => svc.addUser('u1', 200)).toThrow('already exists');
  });

  test('addBet back: reserved = stake', () => {
    svc.createMatch('m1', ['India', 'Australia']);
    svc.addUser('u1', 500);
    const bet = svc.addBet('m1', 'u1', 'back', 'India', 100, 2.0);
    expect(bet.bet_type).toBe('back');
    expect(bet.stake).toBe(100);
    expect(bet.odds).toBe(2.0);
    expect(bet.reserved_amount).toBe(100);
    expect(bet.status).toBe('confirmed');
  });

  test('addBet lay: reserved = stake * (odds-1)', () => {
    svc.createMatch('m1', ['India', 'Australia']);
    svc.addUser('u1', 500);
    const bet = svc.addBet('m1', 'u1', 'lay', 'India', 200, 3.0);
    expect(bet.reserved_amount).toBe(400);
  });

  test('addBet validation errors', () => {
    svc.createMatch('m1', ['India', 'Australia']);
    svc.addUser('u1', 500);
    expect(() => svc.addBet('noMatch', 'u1', 'back', 'India', 100, 2)).toThrow();
    expect(() => svc.addBet('m1', 'noUser', 'back', 'India', 100, 2)).toThrow();
    expect(() => svc.addBet('m1', 'u1', 'back', 'NoTeam', 100, 2)).toThrow();
    expect(() => svc.addBet('m1', 'u1', 'back', 'India', 0, 2)).toThrow();
    expect(() => svc.addBet('m1', 'u1', 'back', 'India', 100, 1)).toThrow();
  });

  test('updateBet changes fields and recalculates reserved', () => {
    svc.createMatch('m1', ['X', 'Y']);
    svc.addUser('u1', 500);
    const bet = svc.addBet('m1', 'u1', 'back', 'X', 50, 2.5);

    const updated = svc.updateBet('m1', bet.id, 'lay', 'Y', 80, 3.0);
    expect(updated.bet_type).toBe('lay');
    expect(updated.stake).toBe(80);
    expect(updated.odds).toBe(3.0);
    expect(updated.reserved_amount).toBe(160);
  });

  test('getBet returns bet or undefined', () => {
    svc.createMatch('m1', ['X', 'Y']);
    svc.addUser('u1', 500);
    const bet = svc.addBet('m1', 'u1', 'back', 'X', 50, 2.5);
    expect(svc.getBet('m1', bet.id)).toBeDefined();
    expect(svc.getBet('m1', 'nonexistent')).toBeUndefined();
    expect(svc.getBet('noMatch', bet.id)).toBeUndefined();
  });

  test('deleteBet removes bet and recalculates', () => {
    svc.createMatch('m1', ['X', 'Y']);
    svc.addUser('u1', 500);
    const bet = svc.addBet('m1', 'u1', 'back', 'X', 50, 2);
    expect(svc.deleteBet('m1', bet.id)).toBe(true);
    expect(svc.getBet('m1', bet.id)).toBeUndefined();
    expect(svc.deleteBet('m1', 'nonexistent')).toBe(false);
  });

  test('deleteMatch and deleteUser', () => {
    svc.createMatch('del1', ['A', 'B']);
    svc.addUser('delU', 100);
    svc.addBet('del1', 'delU', 'back', 'A', 50, 2);

    expect(svc.deleteMatch('del1')).toBe(true);
    expect(svc.getMatch('del1')).toBeUndefined();

    expect(svc.deleteUser('delU')).toBe(true);
    expect(svc.getUser('delU')).toBeUndefined();

    expect(svc.deleteMatch('nonexistent')).toBe(false);
    expect(svc.deleteUser('nonexistent')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Exposure calculation
// ═══════════════════════════════════════════════════════════════
describe('Exposure calculation', () => {
  test('back bet exposure', () => {
    const svc = new CricketLedgerService();
    svc.createMatch('m1', ['A', 'B']);
    svc.addUser('u1', 1000);
    svc.addBet('m1', 'u1', 'back', 'A', 100, 2.0);

    const snap = svc.getExposureSnapshot('m1');
    // back A@2 stake 100: if A wins user gets +100, if A loses user gets -100
    expect(snap.user_exposures['u1']['A'].win).toBe(100);
    expect(snap.user_exposures['u1']['A'].lose).toBe(-100);
    expect(snap.user_exposures['u1']['B'].win).toBe(-100);
    expect(snap.user_exposures['u1']['B'].lose).toBe(100);
  });

  test('lay bet exposure', () => {
    const svc = new CricketLedgerService();
    svc.createMatch('m1', ['A', 'B']);
    svc.addUser('u1', 1000);
    svc.addBet('m1', 'u1', 'lay', 'A', 100, 3.0);

    const snap = svc.getExposureSnapshot('m1');
    // lay A@3 stake 100: liability = 200
    // if A wins: user loses 200, if A loses: user gains 100
    expect(snap.user_exposures['u1']['A'].win).toBe(-200);
    expect(snap.user_exposures['u1']['A'].lose).toBe(100);
    expect(snap.user_exposures['u1']['B'].win).toBe(100);
    expect(snap.user_exposures['u1']['B'].lose).toBe(-200);
  });

  test('team exposures aggregate users', () => {
    const svc = new CricketLedgerService();
    svc.createMatch('m1', ['A', 'B']);
    svc.addUser('u1', 1000);
    svc.addUser('u2', 1000);
    svc.addBet('m1', 'u1', 'back', 'A', 100, 2.0);
    svc.addBet('m1', 'u2', 'lay', 'A', 50, 2.0);

    const snap = svc.getExposureSnapshot('m1');
    // u1 back A: win A +100, lose A -100
    // u2 lay A: win A -50, lose A +50
    // team A total: win = 100 + (-50) = 50, lose = -100 + 50 = -50
    expect(snap.team_exposures['A'].win).toBe(50);
    expect(snap.team_exposures['A'].lose).toBe(-50);
  });

  test('getExposureSnapshot for nonexistent match throws', () => {
    const svc = new CricketLedgerService();
    expect(() => svc.getExposureSnapshot('noMatch')).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Match settlement & P/L reports
// ═══════════════════════════════════════════════════════════════
describe('Match settlement', () => {
  test('back won, lay lost — balance updated correctly', () => {
    const svc = new CricketLedgerService();
    svc.createMatch('m1', ['Alpha', 'Beta']);
    svc.addUser('u1', 1000);

    // back Alpha@2 stake 100 → if Alpha wins: payout=200, profit=100
    svc.addBet('m1', 'u1', 'back', 'Alpha', 100, 2.0);
    // lay Alpha@3 stake 50 → if Alpha wins: liability=100
    svc.addBet('m1', 'u1', 'lay', 'Alpha', 50, 3.0);

    svc.settleMatch('m1', 'Alpha');

    const user = svc.getUser('u1')!;
    // back won: balance += 200 (payout)
    // lay lost: balance += -100 (payout = -liability)
    // 1000 + 200 - 100 = 1100
    expect(user.balance).toBe(1100);
  });

  test('back lost, lay won — balance updated correctly', () => {
    const svc = new CricketLedgerService();
    svc.createMatch('m1', ['Alpha', 'Beta']);
    svc.addUser('u1', 1000);

    svc.addBet('m1', 'u1', 'back', 'Alpha', 100, 2.0);
    svc.addBet('m1', 'u1', 'lay', 'Alpha', 50, 3.0);

    svc.settleMatch('m1', 'Beta');

    const user = svc.getUser('u1')!;
    // back lost: balance += 0
    // lay won: balance += 50
    // 1000 + 0 + 50 = 1050
    expect(user.balance).toBe(1050);
  });

  test('settlement bad team throws', () => {
    const svc = new CricketLedgerService();
    svc.createMatch('m1', ['A', 'B']);
    expect(() => svc.settleMatch('m1', 'NoTeam')).toThrow();
  });

  test('P/L report accuracy', () => {
    const svc = new CricketLedgerService();
    svc.createMatch('m1', ['Alpha', 'Beta']);
    svc.addUser('u1', 1000);
    svc.addBet('m1', 'u1', 'back', 'Alpha', 100, 2.0);
    svc.addBet('m1', 'u1', 'lay', 'Alpha', 50, 3.0);

    svc.settleMatch('m1', 'Alpha');
    const report = svc.generateProfitLossReport('m1', 'u1');

    expect(report.bets).toHaveLength(2);
    // back won: +100, lay lost: -100 → net = 0
    expect(report.total_profit_or_loss).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Manual ledger — event CRUD
// ═══════════════════════════════════════════════════════════════
describe('Manual ledger — event CRUD', () => {
  const ADMIN = 'admin-1';
  let svc: CricketLedgerService;

  beforeEach(() => {
    svc = new CricketLedgerService();
  });

  test('createManualEvent creates event with correct fields', () => {
    const ev = svc.createManualEvent('RCB vs CSK', ['RCB', 'CSK'], 'offline note', ADMIN);
    expect(ev.id).toBeTruthy();
    expect(ev.event_name).toBe('RCB vs CSK');
    expect(ev.teams).toEqual(['RCB', 'CSK']);
    expect(ev.status).toBe('open');
    expect(ev.entries).toHaveLength(0);
    expect(ev.note).toBe('offline note');
    expect(ev.owner_id).toBe(ADMIN);
  });

  test('getManualEventForOwner returns correct event', () => {
    const ev = svc.createManualEvent('Test', [], undefined, ADMIN);
    const fetched = svc.getManualEventForOwner(ev.id, ADMIN);
    expect(fetched.id).toBe(ev.id);
  });

  test('wrong owner cannot access event', () => {
    const ev = svc.createManualEvent('Test', [], undefined, ADMIN);
    expect(() => svc.getManualEventForOwner(ev.id, 'otherAdmin')).toThrow('not found');
  });

  test('blank name throws', () => {
    expect(() => svc.createManualEvent('   ', [], undefined, ADMIN)).toThrow('required');
  });

  test('getAllManualEvents returns all for owner sorted by updated_at desc', () => {
    svc.createManualEvent('E1', [], undefined, ADMIN);
    svc.createManualEvent('E2', [], undefined, ADMIN);
    svc.createManualEvent('E3', [], undefined, 'other-admin');

    const list = svc.getAllManualEvents(ADMIN);
    expect(list).toHaveLength(2);
  });

  test('deleteManualEvent works for owner', () => {
    const ev = svc.createManualEvent('Del', [], undefined, ADMIN);
    expect(svc.deleteManualEvent(ev.id, ADMIN)).toBe(true);
    expect(svc.getAllManualEvents(ADMIN)).toHaveLength(0);
  });

  test('deleteManualEvent returns false for wrong owner', () => {
    const ev = svc.createManualEvent('Del', [], undefined, ADMIN);
    expect(svc.deleteManualEvent(ev.id, 'wrongAdmin')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Manual ledger — entry CRUD & validation
// ═══════════════════════════════════════════════════════════════
describe('Manual ledger — entry CRUD', () => {
  const ADMIN = 'admin-2';
  let svc: CricketLedgerService;
  let eventId: string;

  beforeEach(() => {
    svc = new CricketLedgerService();
    const ev = svc.createManualEvent('MI vs DC', ['MI', 'DC'], undefined, ADMIN);
    eventId = ev.id;
  });

  test('add match back entry — profit and risk calculations', () => {
    const entry = svc.addManualEntry(eventId, ADMIN, {
      customer_name: 'Ramesh',
      market_type: 'match',
      market_name: 'Match Odds',
      selection: 'MI',
      bet_type: 'back',
      stake: 1000,
      price: 2.5,
    });
    expect(entry.status).toBe('open');
    expect(entry.potential_profit).toBe(round(1000 * (2.5 - 1)));
    expect(entry.potential_risk).toBe(1000);
  });

  test('add match lay entry — profit and risk calculations', () => {
    const entry = svc.addManualEntry(eventId, ADMIN, {
      customer_name: 'Suresh',
      market_type: 'match',
      market_name: 'Match Odds',
      selection: 'DC',
      bet_type: 'lay',
      stake: 500,
      price: 3.0,
    });
    expect(entry.potential_profit).toBe(500);
    expect(entry.potential_risk).toBe(round(500 * (3 - 1)));
  });

  test('add session back entry — profit and risk calculations', () => {
    const entry = svc.addManualEntry(eventId, ADMIN, {
      customer_name: 'Offline',
      market_type: 'session',
      market_name: '20 Over MI',
      selection: 'Over 150',
      bet_type: 'back',
      stake: 500,
      price: 90,
    });
    expect(entry.potential_profit).toBe(round(500 * 90 / 100));
    expect(entry.potential_risk).toBe(500);
  });

  test('add session lay entry — profit and risk calculations', () => {
    const entry = svc.addManualEntry(eventId, ADMIN, {
      customer_name: 'Another',
      market_type: 'session',
      market_name: '20 Over DC',
      selection: 'Under 140',
      bet_type: 'lay',
      stake: 300,
      price: 110,
    });
    expect(entry.potential_profit).toBe(300);
    expect(entry.potential_risk).toBe(round(300 * 110 / 100));
  });

  test('update entry changes fields and recalculates', () => {
    const entry = svc.addManualEntry(eventId, ADMIN, {
      customer_name: 'Ramesh',
      market_type: 'match',
      market_name: 'Match Odds',
      selection: 'MI',
      bet_type: 'back',
      stake: 1000,
      price: 2.5,
    });

    const updated = svc.updateManualEntry(eventId, entry.id, ADMIN, {
      customer_name: 'Ramesh Updated',
      market_type: 'match',
      market_name: 'Match Odds',
      selection: 'MI',
      bet_type: 'back',
      stake: 2000,
      price: 2.0,
    });

    expect(updated.customer_name).toBe('Ramesh Updated');
    expect(updated.stake).toBe(2000);
    expect(updated.potential_profit).toBe(round(2000 * (2 - 1)));
  });

  test('delete entry removes it', () => {
    const entry = svc.addManualEntry(eventId, ADMIN, {
      customer_name: 'X',
      market_type: 'match',
      market_name: 'M',
      selection: 'S',
      bet_type: 'back',
      stake: 100,
      price: 2,
    });

    expect(svc.deleteManualEntry(eventId, entry.id, ADMIN)).toBe(true);
    const event = svc.getManualEventForOwner(eventId, ADMIN);
    expect(event.entries).toHaveLength(0);
  });

  test('delete nonexistent entry returns false', () => {
    expect(svc.deleteManualEntry(eventId, 'nonexistent', ADMIN)).toBe(false);
  });

  test('getManualEntry returns correct entry', () => {
    const entry = svc.addManualEntry(eventId, ADMIN, {
      customer_name: 'C',
      market_type: 'match',
      market_name: 'M',
      selection: 'S',
      bet_type: 'back',
      stake: 100,
      price: 2,
    });

    const fetched = svc.getManualEntry(eventId, entry.id, ADMIN);
    expect(fetched.id).toBe(entry.id);
    expect(fetched.customer_name).toBe('C');
  });

  describe('validation', () => {
    test('wrong owner throws', () => {
      expect(() =>
        svc.addManualEntry(eventId, 'wrong-admin', {
          customer_name: 'X',
          market_type: 'match',
          market_name: 'M',
          selection: 'S',
          bet_type: 'back',
          stake: 100,
          price: 2,
        }),
      ).toThrow();
    });

    test('blank customer name throws', () => {
      expect(() =>
        svc.addManualEntry(eventId, ADMIN, {
          customer_name: '',
          market_type: 'match',
          market_name: 'M',
          selection: 'S',
          bet_type: 'back',
          stake: 100,
          price: 2,
        }),
      ).toThrow('Customer name');
    });

    test('blank market name throws', () => {
      expect(() =>
        svc.addManualEntry(eventId, ADMIN, {
          customer_name: 'X',
          market_type: 'match',
          market_name: '  ',
          selection: 'S',
          bet_type: 'back',
          stake: 100,
          price: 2,
        }),
      ).toThrow('Market name');
    });

    test('blank selection throws', () => {
      expect(() =>
        svc.addManualEntry(eventId, ADMIN, {
          customer_name: 'X',
          market_type: 'match',
          market_name: 'M',
          selection: '',
          bet_type: 'back',
          stake: 100,
          price: 2,
        }),
      ).toThrow('Selection');
    });

    test('negative stake throws', () => {
      expect(() =>
        svc.addManualEntry(eventId, ADMIN, {
          customer_name: 'X',
          market_type: 'match',
          market_name: 'M',
          selection: 'S',
          bet_type: 'back',
          stake: -5,
          price: 2,
        }),
      ).toThrow('Stake');
    });

    test('zero stake throws', () => {
      expect(() =>
        svc.addManualEntry(eventId, ADMIN, {
          customer_name: 'X',
          market_type: 'match',
          market_name: 'M',
          selection: 'S',
          bet_type: 'back',
          stake: 0,
          price: 2,
        }),
      ).toThrow('Stake');
    });

    test('match price <= 1 throws', () => {
      expect(() =>
        svc.addManualEntry(eventId, ADMIN, {
          customer_name: 'X',
          market_type: 'match',
          market_name: 'M',
          selection: 'S',
          bet_type: 'back',
          stake: 100,
          price: 0.5,
        }),
      ).toThrow('price');
    });

    test('match price exactly 1 throws', () => {
      expect(() =>
        svc.addManualEntry(eventId, ADMIN, {
          customer_name: 'X',
          market_type: 'match',
          market_name: 'M',
          selection: 'S',
          bet_type: 'back',
          stake: 100,
          price: 1,
        }),
      ).toThrow('price');
    });

    test('session rate 0 throws', () => {
      expect(() =>
        svc.addManualEntry(eventId, ADMIN, {
          customer_name: 'X',
          market_type: 'session',
          market_name: 'M',
          selection: 'S',
          bet_type: 'back',
          stake: 100,
          price: 0,
        }),
      ).toThrow('rate');
    });

    test('session rate negative throws', () => {
      expect(() =>
        svc.addManualEntry(eventId, ADMIN, {
          customer_name: 'X',
          market_type: 'session',
          market_name: 'M',
          selection: 'S',
          bet_type: 'back',
          stake: 100,
          price: -10,
        }),
      ).toThrow('rate');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Manual ledger — settlement
// ═══════════════════════════════════════════════════════════════
describe('Manual ledger — settlement', () => {
  const ADMIN = 'admin-3';

  test('settle as won: realized = potential_profit', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Settlement Test', ['A'], undefined, ADMIN);

    const entry = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'C1',
      market_type: 'match',
      market_name: 'Match Odds',
      selection: 'A',
      bet_type: 'back',
      stake: 1000,
      price: 2.0,
    });

    const settled = svc.settleManualEntry(ev.id, entry.id, ADMIN, 'won');
    expect(settled.status).toBe('won');
    expect(settled.realized_profit_or_loss).toBe(1000); // stake * (price-1)
    expect(settled.settled_at).toBeDefined();
  });

  test('settle as lost: realized = -potential_risk', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Loss Test', [], undefined, ADMIN);

    const entry = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'C2',
      market_type: 'session',
      market_name: '10 Over',
      selection: 'Over',
      bet_type: 'back',
      stake: 500,
      price: 100,
    });

    const settled = svc.settleManualEntry(ev.id, entry.id, ADMIN, 'lost');
    expect(settled.status).toBe('lost');
    expect(settled.realized_profit_or_loss).toBe(-500); // -stake for back
  });

  test('settle as void: realized = 0', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Void Test', [], undefined, ADMIN);

    const entry = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'C',
      market_type: 'session',
      market_name: '20ov',
      selection: 'Over',
      bet_type: 'lay',
      stake: 1000,
      price: 80,
    });

    const voided = svc.settleManualEntry(ev.id, entry.id, ADMIN, 'void');
    expect(voided.status).toBe('void');
    expect(voided.realized_profit_or_loss).toBe(0);
  });

  test('event auto-marks as settled when all entries settled', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Auto-settle', [], undefined, ADMIN);

    const e1 = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'C1',
      market_type: 'match',
      market_name: 'MO',
      selection: 'A',
      bet_type: 'back',
      stake: 100,
      price: 2,
    });
    const e2 = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'C2',
      market_type: 'match',
      market_name: 'MO',
      selection: 'B',
      bet_type: 'back',
      stake: 100,
      price: 2,
    });

    // Settle one — still open
    svc.settleManualEntry(ev.id, e1.id, ADMIN, 'won');
    let event = svc.getManualEventForOwner(ev.id, ADMIN);
    expect(event.status).toBe('open');

    // Settle all — auto-settled
    svc.settleManualEntry(ev.id, e2.id, ADMIN, 'lost');
    event = svc.getManualEventForOwner(ev.id, ADMIN);
    expect(event.status).toBe('settled');
  });

  test('cannot edit a settled entry', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('No Edit', [], undefined, ADMIN);

    const entry = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'X',
      market_type: 'match',
      market_name: 'M',
      selection: 'A',
      bet_type: 'back',
      stake: 100,
      price: 2,
    });

    svc.settleManualEntry(ev.id, entry.id, ADMIN, 'won');

    expect(() =>
      svc.updateManualEntry(ev.id, entry.id, ADMIN, {
        customer_name: 'Y',
        market_type: 'match',
        market_name: 'M',
        selection: 'A',
        bet_type: 'back',
        stake: 200,
        price: 3,
      }),
    ).toThrow('Only open');
  });

  test('re-settle already settled entry (allows correction)', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Re-settle', [], undefined, ADMIN);

    const entry = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'X',
      market_type: 'match',
      market_name: 'M',
      selection: 'A',
      bet_type: 'back',
      stake: 100,
      price: 2,
    });

    svc.settleManualEntry(ev.id, entry.id, ADMIN, 'won');
    const resettled = svc.settleManualEntry(ev.id, entry.id, ADMIN, 'lost');
    expect(resettled.status).toBe('lost');
    expect(resettled.realized_profit_or_loss).toBe(-100);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Event summary & consolidated overview
// ═══════════════════════════════════════════════════════════════
describe('Event summary & consolidated overview', () => {
  const ADMIN = 'admin-5';

  test('summary reflects open and settled entries', () => {
    const svc = new CricketLedgerService();

    const ev = svc.createManualEvent('Summary Test', ['A', 'B'], undefined, ADMIN);

    const e1 = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'C1',
      market_type: 'match',
      market_name: 'MO',
      selection: 'A',
      bet_type: 'back',
      stake: 1000,
      price: 2.0,
    });
    svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'C2',
      market_type: 'session',
      market_name: '20ov',
      selection: 'Over',
      bet_type: 'lay',
      stake: 500,
      price: 100,
    });

    svc.settleManualEntry(ev.id, e1.id, ADMIN, 'won');

    const sum = svc.getManualEventSummary(ev.id, ADMIN);
    expect(sum.entry_count).toBe(2);
    expect(sum.open_entry_count).toBe(1);
    expect(sum.settled_entry_count).toBe(1);
    expect(sum.realized_profit_or_loss).toBe(1000);
    expect(sum.open_potential_profit).toBe(500); // lay session: profit = stake
    expect(sum.open_risk).toBe(round(500 * 100 / 100)); // lay session: risk = stake*rate/100
    expect(sum.status).toBe('open');
  });

  test('consolidated overview aggregates across events', () => {
    const svc = new CricketLedgerService();

    // Event 1: 1 won (+1000)
    const ev1 = svc.createManualEvent('Event 1', [], undefined, ADMIN);
    const e1 = svc.addManualEntry(ev1.id, ADMIN, {
      customer_name: 'C1',
      market_type: 'match',
      market_name: 'MO',
      selection: 'A',
      bet_type: 'back',
      stake: 1000,
      price: 2.0,
    });
    svc.settleManualEntry(ev1.id, e1.id, ADMIN, 'won');

    // Event 2: 1 lost (-400)
    const ev2 = svc.createManualEvent('Event 2', [], undefined, ADMIN);
    const e2 = svc.addManualEntry(ev2.id, ADMIN, {
      customer_name: 'C2',
      market_type: 'match',
      market_name: 'MO',
      selection: 'X',
      bet_type: 'lay',
      stake: 200,
      price: 3.0,
    });
    svc.settleManualEntry(ev2.id, e2.id, ADMIN, 'lost');

    const overview = svc.getManualLedgerOverview(ADMIN);
    expect(overview.totals.event_count).toBe(2);
    expect(overview.totals.open_event_count).toBe(0);
    expect(overview.totals.entry_count).toBe(2);
    expect(overview.totals.open_entry_count).toBe(0);
    // 1000 + (-400) = 600
    expect(overview.totals.realized_profit_or_loss).toBe(600);
  });

  test('empty overview for admin with no events', () => {
    const svc = new CricketLedgerService();
    const overview = svc.getManualLedgerOverview('no-events-admin');
    expect(overview.totals.event_count).toBe(0);
    expect(overview.totals.realized_profit_or_loss).toBe(0);
    expect(overview.events).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Owner isolation
// ═══════════════════════════════════════════════════════════════
describe('Owner isolation', () => {
  test('admins only see their own events', () => {
    const svc = new CricketLedgerService();
    svc.createManualEvent('Admin A event', [], undefined, 'adminA');
    svc.createManualEvent('Admin B event', [], undefined, 'adminB');

    expect(svc.getAllManualEvents('adminA')).toHaveLength(1);
    expect(svc.getAllManualEvents('adminB')).toHaveLength(1);
  });

  test('admin cannot access other admin event', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Admin B', [], undefined, 'adminB');
    expect(() => svc.getManualEventForOwner(ev.id, 'adminA')).toThrow();
  });

  test('admin cannot delete other admin event', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Admin B', [], undefined, 'adminB');
    expect(svc.deleteManualEvent(ev.id, 'adminA')).toBe(false);
  });

  test('overview is isolated per owner', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('A only', [], undefined, 'adminA');
    svc.addManualEntry(ev.id, 'adminA', {
      customer_name: 'X',
      market_type: 'match',
      market_name: 'M',
      selection: 'S',
      bet_type: 'back',
      stake: 100,
      price: 2,
    });

    const overviewA = svc.getManualLedgerOverview('adminA');
    const overviewB = svc.getManualLedgerOverview('adminB');
    expect(overviewA.totals.event_count).toBe(1);
    expect(overviewB.totals.event_count).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Persistence round-trip
// ═══════════════════════════════════════════════════════════════
describe('Persistence round-trip', () => {
  test('data survives service restart', () => {
    const svc1 = new CricketLedgerService();
    svc1.createMatch('persist-m', ['P1', 'P2'], 'pOwner');
    svc1.addUser('persist-u', 999, 'pOwner');
    const pev = svc1.createManualEvent('Persist Event', ['X', 'Y'], 'note', 'pAdmin');
    svc1.addManualEntry(pev.id, 'pAdmin', {
      customer_name: 'PC',
      market_type: 'session',
      market_name: '10ov',
      selection: 'Over',
      bet_type: 'back',
      stake: 200,
      price: 80,
    });
    svc1.saveData();

    // New service instance reloads from disk
    const svc2 = new CricketLedgerService();
    expect(svc2.getMatch('persist-m')).toBeDefined();
    expect(svc2.getUser('persist-u')!.balance).toBe(999);

    const reloadedEvents = svc2.getAllManualEvents('pAdmin');
    expect(reloadedEvents).toHaveLength(1);
    expect(reloadedEvents[0].entries).toHaveLength(1);
    expect(reloadedEvents[0].entries[0].customer_name).toBe('PC');
  });

  test('manual ledger persistence does not corrupt match/user data', () => {
    const svc1 = new CricketLedgerService();
    svc1.createMatch('safe-m', ['A', 'B']);
    svc1.addUser('safe-u', 500);
    svc1.saveData();

    // Add manual ledger data
    svc1.createManualEvent('Manual', [], undefined, 'admin');
    svc1.saveData();

    // Verify original data is intact
    const svc2 = new CricketLedgerService();
    expect(svc2.getMatch('safe-m')).toBeDefined();
    expect(svc2.getUser('safe-u')!.balance).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. P/L math verification
// ═══════════════════════════════════════════════════════════════
describe('P/L math — match bets', () => {
  const A = 'admin-math';

  test('BACK match: profit = stake * (price - 1), risk = stake', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Math', [], undefined, A);
    const entry = svc.addManualEntry(ev.id, A, {
      customer_name: 'M1',
      market_type: 'match',
      market_name: 'MO',
      selection: 'T',
      bet_type: 'back',
      stake: 500,
      price: 3.5,
    });
    expect(entry.potential_profit).toBe(round(500 * 2.5));
    expect(entry.potential_risk).toBe(500);
  });

  test('LAY match: profit = stake, risk = stake * (price - 1)', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Math', [], undefined, A);
    const entry = svc.addManualEntry(ev.id, A, {
      customer_name: 'M2',
      market_type: 'match',
      market_name: 'MO',
      selection: 'T',
      bet_type: 'lay',
      stake: 500,
      price: 3.5,
    });
    expect(entry.potential_profit).toBe(500);
    expect(entry.potential_risk).toBe(round(500 * 2.5));
  });

  test('symmetric match bets net to 0', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Sym', [], undefined, A);

    const e1 = svc.addManualEntry(ev.id, A, {
      customer_name: 'M1',
      market_type: 'match',
      market_name: 'MO',
      selection: 'T',
      bet_type: 'back',
      stake: 500,
      price: 3.5,
    });
    const e2 = svc.addManualEntry(ev.id, A, {
      customer_name: 'M2',
      market_type: 'match',
      market_name: 'MO',
      selection: 'T',
      bet_type: 'lay',
      stake: 500,
      price: 3.5,
    });

    svc.settleManualEntry(ev.id, e1.id, A, 'won');
    svc.settleManualEntry(ev.id, e2.id, A, 'lost');

    const summary = svc.getManualEventSummary(ev.id, A);
    expect(summary.realized_profit_or_loss).toBe(0);
  });
});

describe('P/L math — session bets', () => {
  const A = 'admin-sess-math';

  test('BACK session: profit = stake * rate / 100, risk = stake', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Sess', [], undefined, A);
    const entry = svc.addManualEntry(ev.id, A, {
      customer_name: 'S1',
      market_type: 'session',
      market_name: '20ov',
      selection: 'Over',
      bet_type: 'back',
      stake: 1000,
      price: 90,
    });
    expect(entry.potential_profit).toBe(round(1000 * 90 / 100));
    expect(entry.potential_risk).toBe(1000);
  });

  test('LAY session: profit = stake, risk = stake * rate / 100', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Sess', [], undefined, A);
    const entry = svc.addManualEntry(ev.id, A, {
      customer_name: 'S2',
      market_type: 'session',
      market_name: '20ov',
      selection: 'Under',
      bet_type: 'lay',
      stake: 1000,
      price: 110,
    });
    expect(entry.potential_profit).toBe(1000);
    expect(entry.potential_risk).toBe(round(1000 * 110 / 100));
  });

  test('symmetric session bets net to 0', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Sess Sym', [], undefined, A);

    const e1 = svc.addManualEntry(ev.id, A, {
      customer_name: 'S1',
      market_type: 'session',
      market_name: '20ov',
      selection: 'Over',
      bet_type: 'back',
      stake: 1000,
      price: 90,
    });
    const e2 = svc.addManualEntry(ev.id, A, {
      customer_name: 'S2',
      market_type: 'session',
      market_name: '20ov',
      selection: 'Under',
      bet_type: 'lay',
      stake: 1000,
      price: 90, // same rate
    });

    svc.settleManualEntry(ev.id, e1.id, A, 'lost');
    svc.settleManualEntry(ev.id, e2.id, A, 'won');

    const summary = svc.getManualEventSummary(ev.id, A);
    // back lost: -1000, lay won: +1000 → 0
    expect(summary.realized_profit_or_loss).toBe(0);
  });

  test('session rate > 100: risk multiplied correctly', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('High Rate', [], undefined, A);

    const entry = svc.addManualEntry(ev.id, A, {
      customer_name: 'S',
      market_type: 'session',
      market_name: '20ov',
      selection: 'Over',
      bet_type: 'lay',
      stake: 100,
      price: 200,
    });
    // lay session: profit = 100, risk = 100 * 200 / 100 = 200
    expect(entry.potential_profit).toBe(100);
    expect(entry.potential_risk).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. Edge cases
// ═══════════════════════════════════════════════════════════════
describe('Edge cases', () => {
  const ADMIN = 'admin-edge';

  test('event with no teams is valid', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('No Teams', [], undefined, ADMIN);
    expect(ev.teams).toHaveLength(0);
  });

  test('whitespace-only teams are filtered out', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Whitespace', ['  ', 'A', ''], undefined, ADMIN);
    expect(ev.teams).toEqual(['A']);
  });

  test('very small stake accepted', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Small', [], undefined, ADMIN);
    const entry = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'Small',
      market_type: 'session',
      market_name: 'S',
      selection: 'O',
      bet_type: 'back',
      stake: 0.01,
      price: 1,
    });
    expect(entry.stake).toBe(0.01);
  });

  test('very large stake calculated correctly', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Big', [], undefined, ADMIN);
    const entry = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'Big',
      market_type: 'match',
      market_name: 'M',
      selection: 'A',
      bet_type: 'back',
      stake: 999999,
      price: 99.99,
    });
    expect(entry.potential_profit).toBe(round(999999 * (99.99 - 1)));
  });

  test('event with empty entries has correct summary', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Empty', [], undefined, ADMIN);
    const summary = svc.getManualEventSummary(ev.id, ADMIN);
    expect(summary.entry_count).toBe(0);
    expect(summary.open_entry_count).toBe(0);
    expect(summary.settled_entry_count).toBe(0);
    expect(summary.realized_profit_or_loss).toBe(0);
    expect(summary.open_potential_profit).toBe(0);
    expect(summary.open_risk).toBe(0);
  });

  test('whitespace in entry fields is trimmed', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Trim Test', [], undefined, ADMIN);
    const entry = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: '  Ramesh  ',
      market_type: 'match',
      market_name: '  Match Odds  ',
      selection: '  CSK  ',
      bet_type: 'back',
      stake: 100,
      price: 2,
      note: '  some note  ',
    });
    expect(entry.customer_name).toBe('Ramesh');
    expect(entry.market_name).toBe('Match Odds');
    expect(entry.selection).toBe('CSK');
    expect(entry.note).toBe('some note');
  });

  test('note is optional', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('No Note', [], undefined, ADMIN);
    const entry = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'X',
      market_type: 'match',
      market_name: 'M',
      selection: 'S',
      bet_type: 'back',
      stake: 100,
      price: 2,
    });
    expect(entry.note).toBeUndefined();
  });

  test('whitespace-only note becomes undefined', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('Ws Note', [], undefined, ADMIN);
    const entry = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'X',
      market_type: 'match',
      market_name: 'M',
      selection: 'S',
      bet_type: 'back',
      stake: 100,
      price: 2,
      note: '   ',
    });
    expect(entry.note).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. Real-world scenario: full match lifecycle
// ═══════════════════════════════════════════════════════════════
describe('Real-world scenario — full match lifecycle', () => {
  const ADMIN = 'admin-real';

  test('IPL match with match + session bets, settlement, P/L', () => {
    const svc = new CricketLedgerService();
    const ev = svc.createManualEvent('RCB vs CSK - IPL 2026', ['RCB', 'CSK'], 'offline book', ADMIN);

    // 3 match odds entries
    const m1 = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'Rajesh',
      market_type: 'match',
      market_name: 'Match Odds',
      selection: 'CSK',
      bet_type: 'back',
      stake: 5000,
      price: 1.8,
    });
    const m2 = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'Sunil',
      market_type: 'match',
      market_name: 'Match Odds',
      selection: 'RCB',
      bet_type: 'back',
      stake: 3000,
      price: 2.1,
    });
    const m3 = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'Vikram',
      market_type: 'match',
      market_name: 'Match Odds',
      selection: 'CSK',
      bet_type: 'lay',
      stake: 2000,
      price: 1.9,
    });

    // 2 session entries
    const s1 = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'Rajesh',
      market_type: 'session',
      market_name: '20 Over CSK',
      selection: 'Over 160',
      bet_type: 'back',
      stake: 2000,
      price: 100,
    });
    const s2 = svc.addManualEntry(ev.id, ADMIN, {
      customer_name: 'Sunil',
      market_type: 'session',
      market_name: '20 Over RCB',
      selection: 'Under 145',
      bet_type: 'lay',
      stake: 1500,
      price: 90,
    });

    // Pre-settlement check
    const preSummary = svc.getManualEventSummary(ev.id, ADMIN);
    expect(preSummary.entry_count).toBe(5);
    expect(preSummary.open_entry_count).toBe(5);
    expect(preSummary.realized_profit_or_loss).toBe(0);

    // CSK won. Settle match odds:
    svc.settleManualEntry(ev.id, m1.id, ADMIN, 'won');  // Rajesh back CSK → +4000
    svc.settleManualEntry(ev.id, m2.id, ADMIN, 'lost'); // Sunil back RCB → -3000
    svc.settleManualEntry(ev.id, m3.id, ADMIN, 'lost'); // Vikram lay CSK → -1800

    // Session: CSK 175, RCB 140
    svc.settleManualEntry(ev.id, s1.id, ADMIN, 'won');  // Rajesh back >160 → +2000
    svc.settleManualEntry(ev.id, s2.id, ADMIN, 'won');  // Sunil lay <145 → +1500

    const postSummary = svc.getManualEventSummary(ev.id, ADMIN);
    expect(postSummary.status).toBe('settled');
    expect(postSummary.open_entry_count).toBe(0);

    // m1: +5000*(1.8-1) = +4000
    // m2: -3000 (back risk = stake)
    // m3: -(2000*(1.9-1)) = -1800
    // s1: +2000*100/100 = +2000
    // s2: +1500 (lay profit = stake)
    const expected = round(4000 + (-3000) + (-1800) + 2000 + 1500);
    expect(postSummary.realized_profit_or_loss).toBe(expected);

    // Consolidated should match
    const overview = svc.getManualLedgerOverview(ADMIN);
    expect(overview.totals.realized_profit_or_loss).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. Wallet operations
// ═══════════════════════════════════════════════════════════════
describe('Wallet operations', () => {
  test('deposit increases balance', () => {
    const svc = new CricketLedgerService();
    svc.addUser('w1', 100);
    const result = svc.depositToUserBalance('w1', 50);
    expect(result!.balance).toBe(150);
  });

  test('withdraw decreases balance', () => {
    const svc = new CricketLedgerService();
    svc.addUser('w1', 100);
    const result = svc.withdrawFromUserBalance('w1', 30);
    expect(result!.balance).toBe(70);
  });

  test('withdraw more than balance throws', () => {
    const svc = new CricketLedgerService();
    svc.addUser('w1', 100);
    expect(() => svc.withdrawFromUserBalance('w1', 200)).toThrow('Insufficient');
  });

  test('deposit zero or negative throws', () => {
    const svc = new CricketLedgerService();
    svc.addUser('w1', 100);
    expect(() => svc.depositToUserBalance('w1', 0)).toThrow();
    expect(() => svc.depositToUserBalance('w1', -10)).toThrow();
  });

  test('withdraw zero or negative throws', () => {
    const svc = new CricketLedgerService();
    svc.addUser('w1', 100);
    expect(() => svc.withdrawFromUserBalance('w1', 0)).toThrow();
    expect(() => svc.withdrawFromUserBalance('w1', -10)).toThrow();
  });

  test('deposit/withdraw for nonexistent user returns null', () => {
    const svc = new CricketLedgerService();
    expect(svc.depositToUserBalance('noUser', 50)).toBeNull();
    expect(svc.withdrawFromUserBalance('noUser', 50)).toBeNull();
  });

  test('updateUserBalance sets absolute balance', () => {
    const svc = new CricketLedgerService();
    svc.addUser('w1', 100);
    const result = svc.updateUserBalance('w1', 999);
    expect(result!.balance).toBe(999);
  });

  test('getUserTransactions returns transactions sorted desc', () => {
    const svc = new CricketLedgerService();
    svc.addUser('w1', 100);
    svc.depositToUserBalance('w1', 50);
    svc.depositToUserBalance('w1', 25);
    const txns = svc.getUserTransactions('w1');
    expect(txns).toHaveLength(2);
    // Most recent first
    expect(new Date(txns[0].created_at).getTime()).toBeGreaterThanOrEqual(
      new Date(txns[1].created_at).getTime(),
    );
  });
});
