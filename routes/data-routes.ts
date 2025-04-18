import express from 'express';
import path from 'path';
import fs from 'fs';
import { exportToCSV } from '../utils/csv-utils';
import { saveDataToExcel } from '../utils/excel-utils';

const router = express.Router();

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
    const exportsDir = path.join(rootDir, 'exports');
    
    console.log('Exporting data to directory:', exportsDir);
    
    // Create exports directory if it doesn't exist
    if (!fs.existsSync(exportsDir)) {
      console.log('Creating exports directory');
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    const filePath = path.join(exportsDir, filename);
    console.log('Writing file to:', filePath);
    
    // Save the data to Excel file
    (req as any).ledgerService.saveDataToExcel(filePath);
    
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
  } catch (error) {
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
    const exportsDir = path.join(rootDir, 'exports');
    
    console.log('Exporting CSV data to directory:', exportsDir);
    
    // Create exports directory if it doesn't exist
    if (!fs.existsSync(exportsDir)) {
      console.log('Creating exports directory');
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    // Export data to CSV files
    const csvFiles = exportToCSV(
      (req as any).ledgerService.getMatchesMap(),
      (req as any).ledgerService.getUsersMap(),
      exportsDir
    );
    
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
        { name: path.basename(csvFiles.matchesFile), path: `/exports/${path.basename(csvFiles.matchesFile)}`, type: 'Matches' },
        { name: path.basename(csvFiles.usersFile), path: `/exports/${path.basename(csvFiles.usersFile)}`, type: 'Users' },
        { name: path.basename(csvFiles.betsFile), path: `/exports/${path.basename(csvFiles.betsFile)}`, type: 'Bets' }
      ]
    });
  } catch (error) {
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
    const filePath = path.join(rootDir, 'exports', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.render('error', {
        message: 'File not found',
        title: 'Error'
      });
    }
    
    res.download(filePath, filename);
  } catch (error) {
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
    (req as any).ledgerService.saveData();
    
    res.render('data/export', {
      title: 'Export Data',
      message: 'Data has been successfully saved to disk.',
      success: true
    });
  } catch (error) {
    console.error('Data save error:', error);
    res.render('data/export', {
      title: 'Export Data',
      message: 'Failed to save data: ' + (error instanceof Error ? error.message : 'Unknown error'),
      success: false
    });
  }
});

export default router;
