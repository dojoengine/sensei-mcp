#!/usr/bin/env node

// Use CommonJS require for better compatibility with npx
const path = require('path');
const { spawn } = require('child_process');

// Path to the built main.js file
const mainPath = path.join(__dirname, '../build/src/main.js');

// Log startup information
console.log('Starting Sensei MCP server...');
console.log(`Executing: ${mainPath}`);

// Run the main application
const child = spawn('node', [mainPath], { 
  stdio: 'inherit',
  env: {
    ...process.env,
    // Set log level to info by default
    LOG_LEVEL: process.env.LOG_LEVEL || 'INFO'
  }
});

// Handle errors
child.on('error', (error) => {
  console.error(`Failed to start sensei-mcp: ${error.message}`);
  process.exit(1);
});

// Handle process exit
child.on('close', (code) => {
  if (code !== 0) {
    console.error(`sensei-mcp exited with code ${code}`);
  }
  process.exit(code || 0);
}); 