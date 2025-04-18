"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const csv_utils_1 = require("../utils/csv-utils");
const router = express_1.default.Router();
// Route for rendering the export page
router.get('/', (req, res) => {
    res.render('data/export', {
        title: 'Export Data'
    });
});
// Handle data export to Excel
router.get('/export', (req, res) => {
    try {
        // Create a timestamped filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `cricket-ledger-${timestamp}.xlsx`;
        // Create absolute paths to avoid issues with compiled code
        const rootDir = process.cwd(); // Get current working directory
        const exportsDir = path_1.default.join(rootDir, 'exports');
        console.log('Exporting data to directory:', exportsDir);
        // Create exports directory if it doesn't exist
        if (!fs_1.default.existsSync(exportsDir)) {
            console.log('Creating exports directory');
            fs_1.default.mkdirSync(exportsDir, { recursive: true });
        }
        const filePath = path_1.default.join(exportsDir, filename);
        console.log('Writing file to:', filePath);
        // Save the data to Excel file
        req.ledgerService.saveDataToExcel(filePath);
        // Send the file for download
        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Error downloading file:', err);
                if (!res.headersSent) {
                    res.render('error', {
                        message: 'An error occurred while downloading the file',
                        title: 'Error'
                    });
                }
            }
        });
    }
    catch (error) {
        console.error('Export error:', error);
        res.render('error', {
            message: error instanceof Error ? error.message : 'An error occurred while exporting data',
            title: 'Error'
        });
    }
});
// Export data to CSV files
router.get('/export-csv', (req, res) => {
    try {
        // Create absolute paths to avoid issues with compiled code
        const rootDir = process.cwd(); // Get current working directory
        const exportsDir = path_1.default.join(rootDir, 'exports');
        console.log('Exporting CSV data to directory:', exportsDir);
        // Create exports directory if it doesn't exist
        if (!fs_1.default.existsSync(exportsDir)) {
            console.log('Creating exports directory');
            fs_1.default.mkdirSync(exportsDir, { recursive: true });
        }
        // Export data to CSV files
        const csvFiles = (0, csv_utils_1.exportToCSV)(req.ledgerService.getMatchesMap(), req.ledgerService.getUsersMap(), exportsDir);
        // Create a timestamped filename for the zip
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const zipFilename = `cricket-ledger-${timestamp}-csv.zip`;
        // We're going to just send individual files instead of zipping them
        // Since we don't have a ZIP library in this simplified example
        // Create a simple HTML page that lists the files with download links
        res.render('data/csv-export-success', {
            title: 'CSV Export',
            timestamp,
            files: [
                { name: path_1.default.basename(csvFiles.matchesFile), path: `/exports/${path_1.default.basename(csvFiles.matchesFile)}`, type: 'Matches' },
                { name: path_1.default.basename(csvFiles.usersFile), path: `/exports/${path_1.default.basename(csvFiles.usersFile)}`, type: 'Users' },
                { name: path_1.default.basename(csvFiles.betsFile), path: `/exports/${path_1.default.basename(csvFiles.betsFile)}`, type: 'Bets' }
            ]
        });
    }
    catch (error) {
        console.error('CSV Export error:', error);
        res.render('error', {
            message: error instanceof Error ? error.message : 'An error occurred while exporting CSV data',
            title: 'Error'
        });
    }
});
// Download a specific CSV file
router.get('/download-csv/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const rootDir = process.cwd();
        const filePath = path_1.default.join(rootDir, 'exports', filename);
        if (!fs_1.default.existsSync(filePath)) {
            return res.render('error', {
                message: 'File not found',
                title: 'Error'
            });
        }
        res.download(filePath, filename);
    }
    catch (error) {
        console.error('Download error:', error);
        res.render('error', {
            message: error instanceof Error ? error.message : 'An error occurred while downloading the file',
            title: 'Error'
        });
    }
});
// Export current application data to JSON
router.get('/save', (req, res) => {
    try {
        // Save current data to disk
        req.ledgerService.saveData();
        res.render('data/export', {
            title: 'Export Data',
            message: 'Data has been successfully saved to disk.',
            success: true
        });
    }
    catch (error) {
        console.error('Data save error:', error);
        res.render('data/export', {
            title: 'Export Data',
            message: 'Failed to save data: ' + (error instanceof Error ? error.message : 'Unknown error'),
            success: false
        });
    }
});
exports.default = router;
