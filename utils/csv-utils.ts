// filepath: c:\Project\crawler_learning\cricket ledger\utils\csv-utils.ts
import fs from 'fs';
import path from 'path';
import { MatchLedger, User, Bet } from '../types';

/**
 * Convert data to CSV format
 * @param data Array of objects to convert to CSV
 * @param headers Optional custom headers for the CSV file
 * @returns CSV formatted string
 */
function objectToCSV(data: any[], headers?: string[]): string {
  if (data.length === 0) {
    return '';
  }

  // If headers not provided, use the keys from the first object
  const csvHeaders = headers || Object.keys(data[0]);
  
  // Create header row
  const headerRow = csvHeaders.join(',');
  
  // Create data rows
  const rows = data.map(item => {
    return csvHeaders.map(header => {
      const value = item[header];
      
      // Handle different types of values to ensure proper CSV formatting
      if (value === null || value === undefined) {
        return '';
      } else if (typeof value === 'string') {
        // Escape quotes and wrap in quotes if needed
        const escaped = value.replace(/"/g, '""');
        if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
          return `"${escaped}"`;
        }
        return escaped;
      } else if (typeof value === 'object' && value instanceof Date) {
        return value.toISOString();
      } else if (typeof value === 'object') {
        // Stringify objects, escape quotes
        const escaped = JSON.stringify(value).replace(/"/g, '""');
        return `"${escaped}"`;
      }
      
      return String(value);
    }).join(',');
  });
  
  // Combine header and rows
  return [headerRow, ...rows].join('\n');
}

/**
 * Export cricket ledger data to CSV files
 * @param matches Map of matches
 * @param users Map of users
 * @param outputDir Directory to save the CSV files
 * @returns Object with paths to created files
 */
export function exportToCSV(
  matches: Map<string, MatchLedger>,
  users: Map<string, User>,
  outputDir: string
): { matchesFile: string; usersFile: string; betsFile: string } {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Prepare timestamp for filenames
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Export users
  const usersData = Array.from(users.values()).map(user => ({
    user_id: user.id,
    balance: user.balance
  }));
  
  const usersFile = path.join(outputDir, `users-${timestamp}.csv`);
  fs.writeFileSync(usersFile, objectToCSV(usersData));
  
  // Export matches
  const matchesData = Array.from(matches.values()).map(match => ({
    match_id: match.match_id,
    teams: match.teams.join(' vs '),
    bet_count: match.bets.length
  }));
  
  const matchesFile = path.join(outputDir, `matches-${timestamp}.csv`);
  fs.writeFileSync(matchesFile, objectToCSV(matchesData));
  
  // Export bets
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
        created_at: new Date(bet.created_at).toISOString(),
        reserved_amount: bet.reserved_amount
      });
    });
  });
  
  const betsFile = path.join(outputDir, `bets-${timestamp}.csv`);
  fs.writeFileSync(betsFile, objectToCSV(betsData));
  
  return {
    matchesFile,
    usersFile,
    betsFile
  };
}

/**
 * Create a ZIP file containing all CSV exports
 * @param csvFiles Paths to CSV files to include in the ZIP
 * @param outputPath Path for the output ZIP file
 * @returns Path to the created ZIP file
 */
export function createCSVZip(
  csvFiles: { matchesFile: string; usersFile: string; betsFile: string },
  outputPath: string
): string {
  // This is a placeholder for actual ZIP functionality
  // In a real implementation, you would use a library like adm-zip or archiver
  // Since we're focusing on CSV export, we'll leave this as a basic implementation
  
  const { matchesFile, usersFile, betsFile } = csvFiles;
  
  // Create a simple manifest file listing the CSV files
  const manifestContent = `Cricket Ledger Export
Generated: ${new Date().toISOString()}

Files included:
- ${path.basename(matchesFile)} (Match data)
- ${path.basename(usersFile)} (User data)
- ${path.basename(betsFile)} (Bet data)
`;
  
  const manifestFile = path.join(path.dirname(outputPath), 'export-manifest.txt');
  fs.writeFileSync(manifestFile, manifestContent);
  
  return outputPath;
}