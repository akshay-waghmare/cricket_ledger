"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveDataToExcel = saveDataToExcel;
const xlsx = __importStar(require("xlsx"));
/**
 * Save match and user data to an Excel file
 * @param matches Map of match data
 * @param users Map of user data
 * @param filePath Path where the Excel file will be saved
 * @returns The path where the file was saved
 */
function saveDataToExcel(matches, users, filePath) {
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
