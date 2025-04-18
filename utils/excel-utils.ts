import * as xlsx from 'xlsx';
import { MatchLedger, User } from '../types';

/**
 * Save match and user data to an Excel file
 * @param matches Map of match data
 * @param users Map of user data
 * @param filePath Path where the Excel file will be saved
 * @returns The path where the file was saved
 */
export function saveDataToExcel(
  matches: Map<string, MatchLedger>,
  users: Map<string, User>,
  filePath: string
): string {
  const workbook = xlsx.utils.book_new();
  
  // Create matches worksheet
  const matchesData = Array.from(matches.values()).map(match => ({
    match_id: match.match_id,
    teams: match.teams.join(' vs '),
    bet_count: match.bets.length,
  }));
  
  const matchesSheet = xlsx.utils.json_to_sheet(matchesData);
  xlsx.utils.book_append_sheet(workbook, matchesSheet, 'Matches');
  
  // Create users worksheet
  const usersData = Array.from(users.values()).map(user => ({
    user_id: user.id,
    balance: user.balance,
  }));
  
  const usersSheet = xlsx.utils.json_to_sheet(usersData);
  xlsx.utils.book_append_sheet(workbook, usersSheet, 'Users');
  
  // Create bets worksheet
  const betsData: any[] = [];
  matches.forEach(match => {
    match.bets.forEach(bet => {
      betsData.push({
        match_id: match.match_id,
        teams: match.teams.join(' vs '),
        user_id: bet.user_id,
        bet_type: bet.bet_type,
        target: bet.target,
        stake: bet.stake,
        odds: bet.odds,
        status: bet.status,
        date: new Date(bet.created_at).toLocaleString(),
      });
    });
  });
  
  const betsSheet = xlsx.utils.json_to_sheet(betsData);
  xlsx.utils.book_append_sheet(workbook, betsSheet, 'Bets');
  
  // Write to file
  xlsx.writeFile(workbook, filePath);
  
  return filePath;
}
