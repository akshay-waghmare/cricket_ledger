/**
 * Comprehensive tests for the CricketLedgerService — covering both the
 * existing match/user/bet ledger AND the new admin manual offline ledger.
 *
 * Run from the repo root:
 *   npx ts-node tests/manual-ledger.test.ts
 *
 * The test creates its own isolated working directory so it never touches
 * real data files.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ── bootstrap: force a temp cwd so file-based persistence is isolated ──
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
const origCwd = process.cwd();
process.chdir(TEMP_DIR);

import { CricketLedgerService } from '../cricket-ledger-service';

// ─── test helpers ──────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

function assertThrows(fn: () => void, label: string) {
  try {
    fn();
    failed++;
    failures.push(label + ' (did not throw)');
    console.error(`  ✗ ${label} — expected to throw`);
  } catch {
    passed++;
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

// ── round helper that mirrors the service ──
function round(v: number) {
  return Math.round(v * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════
try {

// ── 1. Core match / user / bet ledger ──────────────────────────────
section('1. Match / user / bet ledger — CRUD');
{
  const svc = new CricketLedgerService();

  // create match
  const match = svc.createMatch('m1', ['India', 'Australia'], 'owner1');
  assert(match.match_id === 'm1', 'createMatch returns correct id');
  assert(match.teams.length === 2, 'createMatch stores both teams');
  assertThrows(() => svc.createMatch('m1', ['A', 'B']), 'duplicate match throws');

  // create user
  const user = svc.addUser('u1', 500, 'owner1');
  assert(user.id === 'u1', 'addUser returns correct id');
  assert(user.balance === 500, 'addUser sets initial balance');
  assertThrows(() => svc.addUser('u1', 100), 'duplicate user throws');

  // add bet - back
  const bet1 = svc.addBet('m1', 'u1', 'back', 'India', 100, 2.0);
  assert(bet1.bet_type === 'back', 'addBet back type correct');
  assert(bet1.stake === 100, 'addBet stake correct');
  assert(bet1.odds === 2.0, 'addBet odds correct');
  assert(bet1.reserved_amount === 100, 'back reserved = stake');

  // add bet - lay
  const bet2 = svc.addBet('m1', 'u1', 'lay', 'India', 200, 3.0);
  assert(bet2.reserved_amount === 400, 'lay reserved = stake * (odds-1)');

  // validation: bad match, bad user, bad team, bad stake/odds
  assertThrows(() => svc.addBet('noMatch', 'u1', 'back', 'India', 100, 2), 'bad match throws');
  assertThrows(() => svc.addBet('m1', 'noUser', 'back', 'India', 100, 2), 'bad user throws');
  assertThrows(() => svc.addBet('m1', 'u1', 'back', 'NoTeam', 100, 2), 'bad team throws');
  assertThrows(() => svc.addBet('m1', 'u1', 'back', 'India', 0, 2), 'zero stake throws');
  assertThrows(() => svc.addBet('m1', 'u1', 'back', 'India', 100, 1), 'odds=1 throws');
}

section('1b. Exposure calculation');
{
  const svc = new CricketLedgerService();
  svc.createMatch('m2', ['A', 'B'], 'owner');
  svc.addUser('u2', 1000, 'owner');

  svc.addBet('m2', 'u2', 'back', 'A', 100, 2.0);
  const snap = svc.getExposureSnapshot('m2');
  // back A@2 stake 100: if A wins user gets +100, if B wins user gets -100
  assert(snap.user_exposures['u2']['A'].win === 100, 'back exposure win for backed team');
  assert(snap.user_exposures['u2']['A'].lose === -100, 'back exposure lose for backed team');
  assert(snap.user_exposures['u2']['B'].win === -100, 'back exposure win for other team = -stake');
  assert(snap.user_exposures['u2']['B'].lose === 100, 'back exposure lose for other team = profit');
}

section('1c. Update and delete bet');
{
  const svc = new CricketLedgerService();
  svc.createMatch('m3', ['X', 'Y'], 'owner');
  svc.addUser('u3', 500, 'owner');
  const bet = svc.addBet('m3', 'u3', 'back', 'X', 50, 2.5);

  // update
  const updated = svc.updateBet('m3', bet.id, 'lay', 'Y', 80, 3.0);
  assert(updated.bet_type === 'lay', 'updateBet changes type');
  assert(updated.stake === 80, 'updateBet changes stake');
  assert(updated.odds === 3.0, 'updateBet changes odds');
  assert(updated.reserved_amount === 160, 'updateBet recalculates reserved');

  // getBet
  const fetched = svc.getBet('m3', bet.id);
  assert(fetched !== undefined, 'getBet returns updated bet');
  assert(fetched!.stake === 80, 'getBet reflects update');

  // delete
  assert(svc.deleteBet('m3', bet.id) === true, 'deleteBet returns true');
  assert(svc.getBet('m3', bet.id) === undefined, 'deleteBet removes bet');
  assert(svc.deleteBet('m3', 'nonexistent') === false, 'deleteBet returns false for missing');
}

section('1d. Settlement');
{
  const svc = new CricketLedgerService();
  svc.createMatch('m4', ['Alpha', 'Beta'], 'owner');
  svc.addUser('settler1', 1000, 'owner');

  // back Alpha@2 stake 100 → if Alpha wins: profit 100
  svc.addBet('m4', 'settler1', 'back', 'Alpha', 100, 2.0);
  // lay Alpha@3 stake 50 → if Alpha wins: lose 100 liability
  svc.addBet('m4', 'settler1', 'lay', 'Alpha', 50, 3.0);

  svc.settleMatch('m4', 'Alpha');

  const user = svc.getUser('settler1');
  // back won: payout=200 → balance += 200
  // lay lost: liability=100 → balance -= 100
  // net: 1000 + 200 - 100 = 1100
  assert(user!.balance === 1100, `settlement balance correct (got ${user!.balance}, expected 1100)`);

  // P/L report
  const report = svc.generateProfitLossReport('m4', 'settler1');
  assert(report.total_profit_or_loss === 0, `net P/L = 0 (back+100, lay-100) got ${report.total_profit_or_loss}`);

  // bad settlement target
  assertThrows(() => svc.settleMatch('m4', 'NoTeam'), 'settle bad team throws');
}

section('1e. Delete match & user');
{
  const svc = new CricketLedgerService();
  svc.createMatch('del1', ['A', 'B'], 'owner');
  svc.addUser('delU', 100, 'owner');
  svc.addBet('del1', 'delU', 'back', 'A', 50, 2);

  assert(svc.deleteMatch('del1') === true, 'deleteMatch true');
  assert(svc.getMatch('del1') === undefined, 'deleteMatch removes match');
  assert(svc.deleteUser('delU') === true, 'deleteUser true');
  assert(svc.getUser('delU') === undefined, 'deleteUser removes user');
}

// ── 2. Manual offline ledger ───────────────────────────────────────
section('2. Manual ledger — event CRUD');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-1';

  // create event
  const ev = svc.createManualEvent('RCB vs CSK', ['RCB', 'CSK'], 'offline note', ADMIN);
  assert(ev.id.length > 0, 'createManualEvent returns id');
  assert(ev.event_name === 'RCB vs CSK', 'event name stored');
  assert(ev.teams.length === 2, 'teams stored');
  assert(ev.status === 'open', 'event starts open');
  assert(ev.entries.length === 0, 'event starts with no entries');
  assert(ev.note === 'offline note', 'note stored');

  // get
  const fetched = svc.getManualEventForOwner(ev.id, ADMIN);
  assert(fetched.id === ev.id, 'getManualEventForOwner returns event');

  // list
  const list = svc.getAllManualEvents(ADMIN);
  assert(list.length >= 1, 'getAllManualEvents returns events');

  // wrong owner cannot access
  assertThrows(() => svc.getManualEventForOwner(ev.id, 'otherAdmin'), 'wrong owner throws');

  // validation
  assertThrows(() => svc.createManualEvent('   ', [], undefined, ADMIN), 'blank name throws');
}

section('2b. Manual ledger — entry CRUD');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-2';

  const ev = svc.createManualEvent('MI vs DC', ['MI', 'DC'], undefined, ADMIN);

  // add match entry (back)
  const entry1 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Ramesh',
    market_type: 'match',
    market_name: 'Match Odds',
    selection: 'MI',
    bet_type: 'back',
    stake: 1000,
    price: 2.5,
    note: 'phone bet',
  });
  assert(entry1.id.length > 0, 'addManualEntry returns id');
  assert(entry1.status === 'open', 'entry starts open');
  assert(entry1.potential_profit === round(1000 * (2.5 - 1)), 'match back profit = stake*(price-1)');
  assert(entry1.potential_risk === 1000, 'match back risk = stake');

  // add match entry (lay)
  const entry2 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Suresh',
    market_type: 'match',
    market_name: 'Match Odds',
    selection: 'DC',
    bet_type: 'lay',
    stake: 500,
    price: 3.0,
  });
  assert(entry2.potential_profit === 500, 'match lay profit = stake');
  assert(entry2.potential_risk === round(500 * (3 - 1)), 'match lay risk = stake*(price-1)');

  // add session entry (back / YES)
  const entry3 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Offline guy',
    market_type: 'session',
    market_name: '20 Over MI',
    selection: 'Over 150',
    bet_type: 'back',
    stake: 500,
    price: 90,
  });
  assert(entry3.potential_profit === round(500 * 90 / 100), 'session back profit = stake*rate/100');
  assert(entry3.potential_risk === 500, 'session back risk = stake');

  // add session entry (lay / NO)
  const entry4 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Another offline',
    market_type: 'session',
    market_name: '20 Over DC',
    selection: 'Under 140',
    bet_type: 'lay',
    stake: 300,
    price: 110,
  });
  assert(entry4.potential_profit === 300, 'session lay profit = stake');
  assert(entry4.potential_risk === round(300 * 110 / 100), 'session lay risk = stake*rate/100');

  // update entry
  const updated = svc.updateManualEntry(ev.id, entry1.id, ADMIN, {
    customer_name: 'Ramesh Updated',
    market_type: 'match',
    market_name: 'Match Odds',
    selection: 'MI',
    bet_type: 'back',
    stake: 2000,
    price: 2.0,
  });
  assert(updated.customer_name === 'Ramesh Updated', 'updateManualEntry changes name');
  assert(updated.stake === 2000, 'updateManualEntry changes stake');
  assert(updated.potential_profit === round(2000 * (2 - 1)), 'updateManualEntry recalcs profit');

  // delete entry
  assert(svc.deleteManualEntry(ev.id, entry4.id, ADMIN) === true, 'deleteManualEntry returns true');
  const refreshed = svc.getManualEventForOwner(ev.id, ADMIN);
  assert(refreshed.entries.length === 3, 'deleteManualEntry removes entry');

  // validation — wrong owner
  assertThrows(() => svc.addManualEntry(ev.id, 'wrong-admin', {
    customer_name: 'X',
    market_type: 'match',
    market_name: 'M',
    selection: 'S',
    bet_type: 'back',
    stake: 100,
    price: 2,
  }), 'wrong owner add entry throws');

  // validation — bad inputs
  assertThrows(() => svc.addManualEntry(ev.id, ADMIN, {
    customer_name: '',
    market_type: 'match',
    market_name: 'M',
    selection: 'S',
    bet_type: 'back',
    stake: 100,
    price: 2,
  }), 'blank customer name throws');

  assertThrows(() => svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'X',
    market_type: 'match',
    market_name: 'M',
    selection: 'S',
    bet_type: 'back',
    stake: -5,
    price: 2,
  }), 'negative stake throws');

  assertThrows(() => svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'X',
    market_type: 'match',
    market_name: 'M',
    selection: 'S',
    bet_type: 'back',
    stake: 100,
    price: 0.5,
  }), 'match price <= 1 throws');

  assertThrows(() => svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'X',
    market_type: 'session',
    market_name: 'M',
    selection: 'S',
    bet_type: 'back',
    stake: 100,
    price: 0,
  }), 'session rate 0 throws');
}

section('2c. Manual ledger — settlement');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-3';

  const ev = svc.createManualEvent('Settlement Test', ['A', 'B'], undefined, ADMIN);

  const e1 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'C1',
    market_type: 'match',
    market_name: 'Match Odds',
    selection: 'A',
    bet_type: 'back',
    stake: 1000,
    price: 2.0,
  });

  const e2 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'C2',
    market_type: 'session',
    market_name: '10 Over A',
    selection: 'Over',
    bet_type: 'back',
    stake: 500,
    price: 100,
  });

  // settle e1 as won
  const settled1 = svc.settleManualEntry(ev.id, e1.id, ADMIN, 'won');
  assert(settled1.status === 'won', 'settle won status');
  assert(settled1.realized_profit_or_loss === 1000, 'settle won P/L = potential_profit');
  assert(settled1.settled_at !== undefined, 'settle sets settled_at');

  // settle e2 as lost
  const settled2 = svc.settleManualEntry(ev.id, e2.id, ADMIN, 'lost');
  assert(settled2.status === 'lost', 'settle lost status');
  assert(settled2.realized_profit_or_loss === -500, 'settle lost P/L = -potential_risk');

  // event should auto-mark as settled (all entries settled)
  const refreshed = svc.getManualEventForOwner(ev.id, ADMIN);
  assert(refreshed.status === 'settled', 'event auto-marks settled when all entries settled');

  // cannot edit a settled entry
  assertThrows(() => svc.updateManualEntry(ev.id, e1.id, ADMIN, {
    customer_name: 'X',
    market_type: 'match',
    market_name: 'M',
    selection: 'S',
    bet_type: 'back',
    stake: 100,
    price: 2,
  }), 'edit settled entry throws');
}

section('2d. Manual ledger — void settlement');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-4';

  const ev = svc.createManualEvent('Void Test', [], undefined, ADMIN);
  const e = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'C',
    market_type: 'session',
    market_name: '20ov',
    selection: 'Over',
    bet_type: 'lay',
    stake: 1000,
    price: 80,
  });

  const voided = svc.settleManualEntry(ev.id, e.id, ADMIN, 'void');
  assert(voided.status === 'void', 'void status');
  assert(voided.realized_profit_or_loss === 0, 'void P/L = 0');
}

section('2e. Manual ledger — event summary & consolidated overview');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-5';

  // Event 1: 2 entries, 1 won, 1 open
  const ev1 = svc.createManualEvent('Event 1', ['A', 'B'], undefined, ADMIN);
  const e1a = svc.addManualEntry(ev1.id, ADMIN, {
    customer_name: 'C1',
    market_type: 'match',
    market_name: 'MO',
    selection: 'A',
    bet_type: 'back',
    stake: 1000,
    price: 2.0,
  });
  const e1b = svc.addManualEntry(ev1.id, ADMIN, {
    customer_name: 'C2',
    market_type: 'session',
    market_name: '20ov',
    selection: 'Over',
    bet_type: 'lay',
    stake: 500,
    price: 100,
  });
  svc.settleManualEntry(ev1.id, e1a.id, ADMIN, 'won');

  // Event 2: all settled
  const ev2 = svc.createManualEvent('Event 2', [], undefined, ADMIN);
  const e2a = svc.addManualEntry(ev2.id, ADMIN, {
    customer_name: 'C3',
    market_type: 'match',
    market_name: 'MO',
    selection: 'X',
    bet_type: 'lay',
    stake: 200,
    price: 3.0,
  });
  svc.settleManualEntry(ev2.id, e2a.id, ADMIN, 'lost');

  // summary for event 1
  const sum1 = svc.getManualEventSummary(ev1.id, ADMIN);
  assert(sum1.entry_count === 2, 'summary entry_count');
  assert(sum1.open_entry_count === 1, 'summary open_entry_count');
  assert(sum1.settled_entry_count === 1, 'summary settled_entry_count');
  assert(sum1.realized_profit_or_loss === 1000, 'summary realized P/L = won profit');
  assert(sum1.open_potential_profit === 500, 'summary open potential profit');
  assert(sum1.open_risk === round(500 * 100 / 100), 'summary open risk');
  assert(sum1.status === 'open', 'event 1 still open (has open entries)');

  // consolidated overview
  const overview = svc.getManualLedgerOverview(ADMIN);
  assert(overview.totals.event_count === 2, 'overview event_count');
  assert(overview.totals.open_event_count === 1, 'overview open_event_count');
  assert(overview.totals.entry_count === 3, 'overview entry_count');
  assert(overview.totals.open_entry_count === 1, 'overview open_entry_count');
  // realized = +1000 (ev1 won) + (-400) (ev2 lost lay risk = 200*(3-1) = 400)
  const expectedRealized = round(1000 + (-400));
  assert(overview.totals.realized_profit_or_loss === expectedRealized,
    `overview realized P/L = ${expectedRealized} (got ${overview.totals.realized_profit_or_loss})`);

  // events are sorted by updated_at desc
  assert(overview.events.length === 2, 'overview events count');
}

section('2f. Manual ledger — owner isolation');
{
  const svc = new CricketLedgerService();

  const ev1 = svc.createManualEvent('Admin A event', [], undefined, 'adminA');
  const ev2 = svc.createManualEvent('Admin B event', [], undefined, 'adminB');

  assert(svc.getAllManualEvents('adminA').length === 1, 'adminA sees only own events');
  assert(svc.getAllManualEvents('adminB').length === 1, 'adminB sees only own events');

  const overviewA = svc.getManualLedgerOverview('adminA');
  assert(overviewA.totals.event_count === 1, 'overview filtered by owner');

  assertThrows(() => svc.getManualEventForOwner(ev2.id, 'adminA'), 'adminA cannot access adminB event');

  assert(svc.deleteManualEvent(ev2.id, 'adminA') === false, 'adminA cannot delete adminB event');
  assert(svc.deleteManualEvent(ev2.id, 'adminB') === true, 'adminB can delete own event');
}

section('2g. Manual ledger — delete event with entries');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-del';

  const ev = svc.createManualEvent('Del Test', ['A'], undefined, ADMIN);
  svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'X',
    market_type: 'match',
    market_name: 'M',
    selection: 'A',
    bet_type: 'back',
    stake: 100,
    price: 2,
  });

  assert(svc.deleteManualEvent(ev.id, ADMIN) === true, 'deleteManualEvent with entries succeeds');
  assert(svc.getAllManualEvents(ADMIN).length === 0, 'event deleted completely');
}

// ── 3. Persistence round-trip ──────────────────────────────────────
section('3. Persistence round-trip');
{
  const svc1 = new CricketLedgerService();
  svc1.createMatch('persist-m', ['P1', 'P2'], 'pOwner');
  svc1.addUser('persist-u', 999, 'pOwner');
  const pev = svc1.createManualEvent('Persist Event', ['X', 'Y'], 'persist note', 'pAdmin');
  svc1.addManualEntry(pev.id, 'pAdmin', {
    customer_name: 'PC',
    market_type: 'session',
    market_name: '10ov',
    selection: 'Over',
    bet_type: 'back',
    stake: 200,
    price: 80,
  });

  // Force save and then create a fresh service (reloads from disk)
  svc1.saveData();

  const svc2 = new CricketLedgerService();
  assert(svc2.getMatch('persist-m') !== undefined, 'match survives reload');
  assert(svc2.getUser('persist-u')!.balance === 999, 'user balance survives reload');

  const reloadedEvents = svc2.getAllManualEvents('pAdmin');
  assert(reloadedEvents.length === 1, 'manual event survives reload');
  assert(reloadedEvents[0].entries.length === 1, 'manual entry survives reload');
  assert(reloadedEvents[0].entries[0].customer_name === 'PC', 'entry data intact after reload');
}

// ── 4. Edge cases ──────────────────────────────────────────────────
section('4. Edge cases');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-edge';

  // event with no teams
  const ev = svc.createManualEvent('No Teams', [], undefined, ADMIN);
  assert(ev.teams.length === 0, 'event with no teams is valid');

  // event with whitespace-only teams
  const ev2 = svc.createManualEvent('Whitespace Teams', ['  ', 'A', ''], undefined, ADMIN);
  assert(ev2.teams.length === 1, 'whitespace-only teams are filtered out');
  assert(ev2.teams[0] === 'A', 'remaining team is trimmed');

  // entry with very small values
  const entry = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Small',
    market_type: 'session',
    market_name: 'S',
    selection: 'O',
    bet_type: 'back',
    stake: 0.01,
    price: 1,
  });
  assert(entry.stake === 0.01, 'tiny stake accepted');
  assert(entry.potential_profit === 0, 'tiny profit rounded to 0');

  // entry with large values
  const entry2 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Big',
    market_type: 'match',
    market_name: 'M',
    selection: 'A',
    bet_type: 'back',
    stake: 999999,
    price: 99.99,
  });
  assert(entry2.potential_profit === round(999999 * (99.99 - 1)), 'large profit calculated correctly');

  // re-settle already settled entry (should work — allows correction)
  const ev3 = svc.createManualEvent('Re-settle', [], undefined, ADMIN);
  const e3 = svc.addManualEntry(ev3.id, ADMIN, {
    customer_name: 'X',
    market_type: 'match',
    market_name: 'M',
    selection: 'A',
    bet_type: 'back',
    stake: 100,
    price: 2,
  });
  svc.settleManualEntry(ev3.id, e3.id, ADMIN, 'won');
  const resettled = svc.settleManualEntry(ev3.id, e3.id, ADMIN, 'lost');
  assert(resettled.status === 'lost', 're-settle changes status');
  assert(resettled.realized_profit_or_loss === -100, 're-settle recalcs P/L');
}

// ── 5. P/L math verification ───────────────────────────────────────
section('5. P/L math — match bets');
{
  const svc = new CricketLedgerService();
  const A = 'admin-math';

  const ev = svc.createManualEvent('Math Test', [], undefined, A);

  // BACK match: profit = stake * (price - 1), risk = stake
  const e1 = svc.addManualEntry(ev.id, A, {
    customer_name: 'M1', market_type: 'match', market_name: 'MO',
    selection: 'T', bet_type: 'back', stake: 500, price: 3.5,
  });
  assert(e1.potential_profit === round(500 * 2.5), 'match back profit 500@3.5 = 1250');
  assert(e1.potential_risk === 500, 'match back risk = 500');

  // LAY match: profit = stake, risk = stake * (price - 1)
  const e2 = svc.addManualEntry(ev.id, A, {
    customer_name: 'M2', market_type: 'match', market_name: 'MO',
    selection: 'T', bet_type: 'lay', stake: 500, price: 3.5,
  });
  assert(e2.potential_profit === 500, 'match lay profit = 500');
  assert(e2.potential_risk === round(500 * 2.5), 'match lay risk = 1250');

  // settle both: one won, one lost
  svc.settleManualEntry(ev.id, e1.id, A, 'won');
  svc.settleManualEntry(ev.id, e2.id, A, 'lost');

  const summary = svc.getManualEventSummary(ev.id, A);
  // realized = 1250 (won) + (-1250) (lost) = 0
  assert(summary.realized_profit_or_loss === 0, 'symmetric match P/L nets to 0');
}

section('5b. P/L math — session bets');
{
  const svc = new CricketLedgerService();
  const A = 'admin-sess-math';

  const ev = svc.createManualEvent('Session Math', [], undefined, A);

  // BACK session (YES): profit = stake * rate / 100, risk = stake
  const e1 = svc.addManualEntry(ev.id, A, {
    customer_name: 'S1', market_type: 'session', market_name: '20ov',
    selection: 'Over', bet_type: 'back', stake: 1000, price: 90,
  });
  assert(e1.potential_profit === round(1000 * 90 / 100), 'session back profit = 900');
  assert(e1.potential_risk === 1000, 'session back risk = 1000');

  // LAY session (NO): profit = stake, risk = stake * rate / 100
  const e2 = svc.addManualEntry(ev.id, A, {
    customer_name: 'S2', market_type: 'session', market_name: '20ov',
    selection: 'Under', bet_type: 'lay', stake: 1000, price: 110,
  });
  assert(e2.potential_profit === 1000, 'session lay profit = 1000');
  assert(e2.potential_risk === round(1000 * 110 / 100), 'session lay risk = 1100');

  // settle
  svc.settleManualEntry(ev.id, e1.id, A, 'lost');
  svc.settleManualEntry(ev.id, e2.id, A, 'won');

  const summary = svc.getManualEventSummary(ev.id, A);
  // realized = -1000 (back lost) + 1000 (lay won) = 0
  assert(summary.realized_profit_or_loss === 0, 'session symmetric P/L nets to 0');
}

// ── 6. Real-world scenario: full match lifecycle ───────────────────
section('6. Real-world scenario');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-real';

  const ev = svc.createManualEvent('RCB vs CSK - IPL 2026', ['RCB', 'CSK'], 'offline book', ADMIN);

  // 3 match odds entries from different customers
  const m1 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Rajesh', market_type: 'match', market_name: 'Match Odds',
    selection: 'CSK', bet_type: 'back', stake: 5000, price: 1.8,
  });
  const m2 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Sunil', market_type: 'match', market_name: 'Match Odds',
    selection: 'RCB', bet_type: 'back', stake: 3000, price: 2.1,
  });
  const m3 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Vikram', market_type: 'match', market_name: 'Match Odds',
    selection: 'CSK', bet_type: 'lay', stake: 2000, price: 1.9,
  });

  // 2 session entries
  const s1 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Rajesh', market_type: 'session', market_name: '20 Over CSK',
    selection: 'Over 160', bet_type: 'back', stake: 2000, price: 100,
  });
  const s2 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Sunil', market_type: 'session', market_name: '20 Over RCB',
    selection: 'Under 145', bet_type: 'lay', stake: 1500, price: 90,
  });

  // Pre-settlement check
  const preSummary = svc.getManualEventSummary(ev.id, ADMIN);
  assert(preSummary.entry_count === 5, 'real-world: 5 entries');
  assert(preSummary.open_entry_count === 5, 'real-world: all open');
  assert(preSummary.realized_profit_or_loss === 0, 'real-world: no realized yet');

  // CSK won the match. Settle match odds:
  svc.settleManualEntry(ev.id, m1.id, ADMIN, 'won');   // Rajesh back CSK won → +4000
  svc.settleManualEntry(ev.id, m2.id, ADMIN, 'lost');   // Sunil back RCB lost → -3000
  svc.settleManualEntry(ev.id, m3.id, ADMIN, 'lost');   // Vikram lay CSK lost → -1800

  // Session results: CSK scored 175, RCB scored 140
  svc.settleManualEntry(ev.id, s1.id, ADMIN, 'won');    // Rajesh back >160 won → +2000
  svc.settleManualEntry(ev.id, s2.id, ADMIN, 'won');    // Sunil lay <145 won (RCB 140) → +1500

  const postSummary = svc.getManualEventSummary(ev.id, ADMIN);
  assert(postSummary.status === 'settled', 'real-world: event settled');
  assert(postSummary.open_entry_count === 0, 'real-world: no open entries');

  // Expected realized:
  // m1: +4000, m2: -3000, m3: -(2000*0.9) = -1800, s1: +2000, s2: +1500
  const expectedTotal = round(4000 + (-3000) + (-1800) + 2000 + 1500);
  assert(postSummary.realized_profit_or_loss === expectedTotal,
    `real-world realized P/L = ${expectedTotal} (got ${postSummary.realized_profit_or_loss})`);

  // consolidated should show same
  const overview = svc.getManualLedgerOverview(ADMIN);
  assert(overview.totals.realized_profit_or_loss === expectedTotal, 'overview matches event total');
}

// ── 7. Wallet operations ───────────────────────────────────────
section('7. Wallet operations');
{
  const svc = new CricketLedgerService();
  svc.addUser('w1', 100);

  // deposit
  const deposited = svc.depositToUserBalance('w1', 50);
  assert(deposited!.balance === 150, 'deposit increases balance');

  // withdraw
  const withdrawn = svc.withdrawFromUserBalance('w1', 30);
  assert(withdrawn!.balance === 120, 'withdraw decreases balance');

  // withdraw more than balance
  assertThrows(() => svc.withdrawFromUserBalance('w1', 200), 'withdraw > balance throws');

  // deposit zero/negative
  assertThrows(() => svc.depositToUserBalance('w1', 0), 'deposit 0 throws');
  assertThrows(() => svc.depositToUserBalance('w1', -10), 'deposit negative throws');

  // withdraw zero/negative
  assertThrows(() => svc.withdrawFromUserBalance('w1', 0), 'withdraw 0 throws');
  assertThrows(() => svc.withdrawFromUserBalance('w1', -10), 'withdraw negative throws');

  // nonexistent user
  assert(svc.depositToUserBalance('noUser', 50) === null, 'deposit nonexistent returns null');
  assert(svc.withdrawFromUserBalance('noUser', 50) === null, 'withdraw nonexistent returns null');

  // updateUserBalance (absolute)
  const updated = svc.updateUserBalance('w1', 999);
  assert(updated!.balance === 999, 'updateUserBalance sets absolute');
  assert(svc.updateUserBalance('noUser', 100) === null, 'updateUserBalance nonexistent returns null');

  // transactions
  const txns = svc.getUserTransactions('w1');
  assert(txns.length >= 2, 'transactions recorded for deposits/withdrawals');
  // sorted desc by created_at
  assert(new Date(txns[0].created_at).getTime() >= new Date(txns[1].created_at).getTime(),
    'transactions sorted desc');
}

// ── 8. Settlement balance math (back lost, lay won) ────────────
section('8. Settlement — back lost, lay won');
{
  const svc = new CricketLedgerService();
  svc.createMatch('m-settle2', ['Alpha', 'Beta']);
  svc.addUser('u-settle2', 1000);

  svc.addBet('m-settle2', 'u-settle2', 'back', 'Alpha', 100, 2.0);
  svc.addBet('m-settle2', 'u-settle2', 'lay', 'Alpha', 50, 3.0);

  svc.settleMatch('m-settle2', 'Beta');

  const user = svc.getUser('u-settle2');
  // back Alpha lost (Beta won): balance += 0
  // lay Alpha won (Beta won): balance += 50
  // 1000 + 0 + 50 = 1050
  assert(user!.balance === 1050, `back-lost/lay-won balance = 1050 (got ${user!.balance})`);
}

// ── 9. Manual entry — whitespace trimming and note handling ────
section('9. Entry field trimming');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-trim';
  const ev = svc.createManualEvent('Trim Test', [], undefined, ADMIN);

  // trimming
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
  assert(entry.customer_name === 'Ramesh', 'customer_name trimmed');
  assert(entry.market_name === 'Match Odds', 'market_name trimmed');
  assert(entry.selection === 'CSK', 'selection trimmed');
  assert(entry.note === 'some note', 'note trimmed');

  // whitespace-only note becomes undefined
  const entry2 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'X',
    market_type: 'match',
    market_name: 'M',
    selection: 'S',
    bet_type: 'back',
    stake: 100,
    price: 2,
    note: '   ',
  });
  assert(entry2.note === undefined, 'whitespace-only note becomes undefined');

  // no note
  const entry3 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Y',
    market_type: 'match',
    market_name: 'M',
    selection: 'S',
    bet_type: 'back',
    stake: 100,
    price: 2,
  });
  assert(entry3.note === undefined, 'undefined note stays undefined');
}

// ── 10. Empty event summary ────────────────────────────────────
section('10. Empty event summary');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-empty';
  const ev = svc.createManualEvent('Empty', [], undefined, ADMIN);
  const summary = svc.getManualEventSummary(ev.id, ADMIN);
  assert(summary.entry_count === 0, 'empty event: entry_count = 0');
  assert(summary.open_entry_count === 0, 'empty event: open = 0');
  assert(summary.settled_entry_count === 0, 'empty event: settled = 0');
  assert(summary.realized_profit_or_loss === 0, 'empty event: realized = 0');
  assert(summary.open_potential_profit === 0, 'empty event: open profit = 0');
  assert(summary.open_risk === 0, 'empty event: open risk = 0');
}

// ── 11. Empty overview for admin with no events ────────────────
section('11. Empty overview');
{
  const svc = new CricketLedgerService();
  const overview = svc.getManualLedgerOverview('no-events-admin');
  assert(overview.totals.event_count === 0, 'empty overview: event_count = 0');
  assert(overview.totals.realized_profit_or_loss === 0, 'empty overview: realized = 0');
  assert(overview.events.length === 0, 'empty overview: events array empty');
}

// ── 12. Session rate > 100 ─────────────────────────────────────
section('12. Session rate > 100');
{
  const svc = new CricketLedgerService();
  const A = 'admin-high-rate';
  const ev = svc.createManualEvent('High Rate', [], undefined, A);
  const entry = svc.addManualEntry(ev.id, A, {
    customer_name: 'S', market_type: 'session', market_name: '20ov',
    selection: 'Over', bet_type: 'lay', stake: 100, price: 200,
  });
  assert(entry.potential_profit === 100, 'lay session@200: profit = 100');
  assert(entry.potential_risk === 200, 'lay session@200: risk = 100*200/100 = 200');
}

// ── 13. Validation — blank market_name and selection ───────────
section('13. Additional validation');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-val';
  const ev = svc.createManualEvent('Val Test', [], undefined, ADMIN);

  assertThrows(() => svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'X', market_type: 'match', market_name: '  ',
    selection: 'S', bet_type: 'back', stake: 100, price: 2,
  }), 'blank market_name throws');

  assertThrows(() => svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'X', market_type: 'match', market_name: 'M',
    selection: '', bet_type: 'back', stake: 100, price: 2,
  }), 'blank selection throws');

  // match price exactly 1
  assertThrows(() => svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'X', market_type: 'match', market_name: 'M',
    selection: 'S', bet_type: 'back', stake: 100, price: 1,
  }), 'match price exactly 1 throws');

  // session negative rate
  assertThrows(() => svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'X', market_type: 'session', market_name: 'M',
    selection: 'S', bet_type: 'back', stake: 100, price: -10,
  }), 'session negative rate throws');
}

// ── 14. Manual entry not found ─────────────────────────────────
section('14. Manual entry not found');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-notfound';
  const ev = svc.createManualEvent('NF', [], undefined, ADMIN);
  assertThrows(() => svc.getManualEntry(ev.id, 'nonexistent', ADMIN), 'nonexistent entry throws');
  assertThrows(() => svc.settleManualEntry(ev.id, 'nonexistent', ADMIN, 'won'), 'settle nonexistent throws');
}

// ── 15. Multiple events P/L isolation ──────────────────────────
section('15. Multi-event P/L isolation');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-multi';

  // Event 1: +500
  const ev1 = svc.createManualEvent('Ev1', [], undefined, ADMIN);
  const e1 = svc.addManualEntry(ev1.id, ADMIN, {
    customer_name: 'C', market_type: 'match', market_name: 'MO',
    selection: 'A', bet_type: 'back', stake: 500, price: 2.0,
  });
  svc.settleManualEntry(ev1.id, e1.id, ADMIN, 'won');

  // Event 2: -300
  const ev2 = svc.createManualEvent('Ev2', [], undefined, ADMIN);
  const e2 = svc.addManualEntry(ev2.id, ADMIN, {
    customer_name: 'C', market_type: 'match', market_name: 'MO',
    selection: 'B', bet_type: 'back', stake: 300, price: 2.0,
  });
  svc.settleManualEntry(ev2.id, e2.id, ADMIN, 'lost');

  // Event 3: open, +200 potential
  const ev3 = svc.createManualEvent('Ev3', [], undefined, ADMIN);
  svc.addManualEntry(ev3.id, ADMIN, {
    customer_name: 'C', market_type: 'match', market_name: 'MO',
    selection: 'C', bet_type: 'back', stake: 200, price: 2.0,
  });

  const overview = svc.getManualLedgerOverview(ADMIN);
  assert(overview.totals.event_count === 3, 'multi-event: 3 events');
  assert(overview.totals.open_event_count === 1, 'multi-event: 1 open');
  assert(overview.totals.realized_profit_or_loss === round(500 + (-300)),
    `multi-event: realized = 200 (got ${overview.totals.realized_profit_or_loss})`);
  assert(overview.totals.open_potential_profit === 200, 'multi-event: open profit = 200');
  assert(overview.totals.open_risk === 200, 'multi-event: open risk = 200');
}

// ── 16. Session settlement by actual score ─────────────────────
section('16. Session settlement by actual score');
{
  const svc = new CricketLedgerService();
  const ADMIN = 'admin-session';
  const ev = svc.createManualEvent('IPL 2026 - CSK vs RCB', ['CSK', 'RCB'], undefined, ADMIN);

  // YES (back) at line 35, rate 90 — profit = 1000 * 90/100 = 900
  const yes1 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Rajesh', market_type: 'session', market_name: '6 Over CSK',
    selection: '35', bet_type: 'back', stake: 1000, price: 90,
  });
  assert(yes1.potential_profit === 900, 'session YES profit = 900');
  assert(yes1.potential_risk === 1000, 'session YES risk = 1000');

  // NO (lay) at line 35, rate 80 — profit = 500, risk = 500 * 80/100 = 400
  const no1 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Sunil', market_type: 'session', market_name: '6 Over CSK',
    selection: '35', bet_type: 'lay', stake: 500, price: 80,
  });
  assert(no1.potential_profit === 500, 'session NO profit = 500');
  assert(no1.potential_risk === 400, 'session NO risk = 400');

  // Actual score = 42 (>= 35) → YES wins
  const settled1 = svc.settleManualSessionEntry(ev.id, yes1.id, ADMIN, 42);
  assert(settled1.status === 'won', 'YES wins when score >= line');
  assert(settled1.actual_score === 42, 'actual_score recorded');
  assert(settled1.realized_profit_or_loss === 900, 'YES won realized = +900');

  const settled2 = svc.settleManualSessionEntry(ev.id, no1.id, ADMIN, 42);
  assert(settled2.status === 'lost', 'NO loses when score >= line');
  assert(settled2.realized_profit_or_loss === -400, 'NO lost realized = -400');

  // New entries with score below line
  const yes2 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Vikram', market_type: 'session', market_name: '10 Over CSK',
    selection: '75', bet_type: 'back', stake: 2000, price: 100,
  });
  const no2 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Amit', market_type: 'session', market_name: '10 Over CSK',
    selection: '75', bet_type: 'lay', stake: 1000, price: 100,
  });

  // Actual score = 68 (< 75) → NO wins
  const settled3 = svc.settleManualSessionEntry(ev.id, yes2.id, ADMIN, 68);
  assert(settled3.status === 'lost', 'YES loses when score < line');
  assert(settled3.realized_profit_or_loss === -2000, 'YES lost realized = -2000');

  const settled4 = svc.settleManualSessionEntry(ev.id, no2.id, ADMIN, 68);
  assert(settled4.status === 'won', 'NO wins when score < line');
  assert(settled4.realized_profit_or_loss === 1000, 'NO won realized = +1000');

  // Exact line: score = 75 → YES wins (>= line)
  const yes3 = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Ravi', market_type: 'session', market_name: '15 Over CSK',
    selection: '110', bet_type: 'back', stake: 500, price: 90,
  });
  const settled5 = svc.settleManualSessionEntry(ev.id, yes3.id, ADMIN, 110);
  assert(settled5.status === 'won', 'YES wins when score = line (exact)');

  // Error: non-numeric line
  const matchEntry = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'X', market_type: 'session', market_name: 'Custom',
    selection: 'Over', bet_type: 'back', stake: 100, price: 90,
  });
  assertThrows(
    () => svc.settleManualSessionEntry(ev.id, matchEntry.id, ADMIN, 50),
    'non-numeric line throws on session settle',
  );

  // Error: session settle on match entry
  const matchE = svc.addManualEntry(ev.id, ADMIN, {
    customer_name: 'Y', market_type: 'match', market_name: 'MO',
    selection: 'CSK', bet_type: 'back', stake: 100, price: 2.0,
  });
  assertThrows(
    () => svc.settleManualSessionEntry(ev.id, matchE.id, ADMIN, 50),
    'session settle on match entry throws',
  );

  // Verify actual_score persisted after reload
  const reloaded = svc.getManualEntry(ev.id, yes1.id, ADMIN);
  assert(reloaded.actual_score === 42, 'actual_score persisted after getManualEntry');
}

} finally {
  // Restore cwd & clean up
  process.chdir(origCwd);
  try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── Report ─────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(`  PASSED: ${passed}`);
console.log(`  FAILED: ${failed}`);
if (failures.length > 0) {
  console.log('\n  Failures:');
  failures.forEach(f => console.log(`    • ${f}`));
}
console.log('══════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
