#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the built main.js file
const mainPath = join(__dirname, '../build/src/main.js');

// Run the main application
const child = spawn('node', [mainPath], { stdio: 'inherit' });

child.on('error', (error) => {
  console.error(`Failed to start sensei-mcp: ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code || 0);
}); 