"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportToCSV = exportToCSV;
exports.createCSVZip = createCSVZip;
// filepath: c:\Project\crawler_learning\cricket ledger\utils\csv-utils.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Convert data to CSV format
 * @param data Array of objects to convert to CSV
 * @param headers Optional custom headers for the CSV file
 * @returns CSV formatted string
 */
function objectToCSV(data, headers) {
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
            }
            else if (typeof value === 'string') {
                // Escape quotes and wrap in quotes if needed
                const escaped = value.replace(/"/g, '""');
                if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
                    return `"${escaped}"`;
                }
                return escaped;
            }
            else if (typeof value === 'object' && value instanceof Date) {
                return value.toISOString();
            }
            else if (typeof value === 'object') {
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
function exportToCSV(matches, users, outputDir) {
    // Ensure output directory exists
    if (!fs_1.default.existsSync(outputDir)) {
        fs_1.default.mkdirSync(outputDir, { recursive: true });
    }
    // Prepare timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Export users
    const usersData = Array.from(users.values()).map(user => ({
        user_id: user.id,
        balance: user.balance
    }));
    const usersFile = path_1.default.join(outputDir, `users-${timestamp}.csv`);
    fs_1.default.writeFileSync(usersFile, objectToCSV(usersData));
    // Export matches
    const matchesData = Array.from(matches.values()).map(match => ({
        match_id: match.match_id,
        teams: match.teams.join(' vs '),
        bet_count: match.bets.length
    }));
    const matchesFile = path_1.default.join(outputDir, `matches-${timestamp}.csv`);
    fs_1.default.writeFileSync(matchesFile, objectToCSV(matchesData));
    // Export bets
    const betsData = [];
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
    const betsFile = path_1.default.join(outputDir, `bets-${timestamp}.csv`);
    fs_1.default.writeFileSync(betsFile, objectToCSV(betsData));
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
function createCSVZip(csvFiles, outputPath) {
    // This is a placeholder for actual ZIP functionality
    // In a real implementation, you would use a library like adm-zip or archiver
    // Since we're focusing on CSV export, we'll leave this as a basic implementation
    const { matchesFile, usersFile, betsFile } = csvFiles;
    // Create a simple manifest file listing the CSV files
    const manifestContent = `Cricket Ledger Export
Generated: ${new Date().toISOString()}

Files included:
- ${path_1.default.basename(matchesFile)} (Match data)
- ${path_1.default.basename(usersFile)} (User data)
- ${path_1.default.basename(betsFile)} (Bet data)
`;
    const manifestFile = path_1.default.join(path_1.default.dirname(outputPath), 'export-manifest.txt');
    fs_1.default.writeFileSync(manifestFile, manifestContent);
    return outputPath;
}
