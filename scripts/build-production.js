#!/usr/bin/env node

/**
 * Production build script for Browzer
 * Sets proper environment variables and builds executables
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Set production environment
process.env.NODE_ENV = 'production';

console.log('🚀 Building Browzer for production...\n');

// Build steps
const steps = [
  {
    name: 'Clean previous builds',
    command: 'npm run clean',
    optional: true
  },
  {
    name: 'Compile TypeScript and Webpack',
    command: 'npx webpack --config webpack.renderer.config.js --mode=production && npx tsc --build'
  },
  {
    name: 'Copy Python files',
    command: 'node scripts/copy-python-files.js'
  }
];

// Execute build steps
for (const step of steps) {
  try {
    console.log(`📦 ${step.name}...`);
    execSync(step.command, { 
      stdio: 'inherit', 
      env: { ...process.env, NODE_ENV: 'production' }
    });
    console.log(`✅ ${step.name} completed\n`);
  } catch (error) {
    if (step.optional) {
      console.log(`⚠️  ${step.name} failed (optional step, continuing...)\n`);
    } else {
      console.error(`❌ ${step.name} failed:`, error.message);
      process.exit(1);
    }
  }
}

// Platform-specific builds
const platform = process.argv[2] || 'current';

const buildCommands = {
  mac: 'electron-builder --mac dmg zip',
  'mac-universal': 'electron-builder --mac --universal dmg zip',
  linux: 'electron-builder --linux',
  windows: 'electron-builder --win',
  all: 'electron-builder --mac --linux --win',
  current: process.platform === 'darwin' ? 'electron-builder --mac dmg zip' :
           process.platform === 'linux' ? 'electron-builder --linux' :
           process.platform === 'win32' ? 'electron-builder --win' :
           'electron-builder'
};

const buildCommand = buildCommands[platform] || buildCommands.current;

try {
  console.log(`🏗️  Building executables for ${platform}...`);
  execSync(buildCommand, { 
    stdio: 'inherit', 
    env: { ...process.env, NODE_ENV: 'production' }
  });
  console.log('\n✅ Production build completed!');
  console.log('📁 Executables available in: releases/');
  
  // List built files
  const releasesDir = path.join(__dirname, '..', 'releases');
  if (fs.existsSync(releasesDir)) {
    const files = fs.readdirSync(releasesDir);
    console.log('\n📋 Built files:');
    files.forEach(file => {
      const filePath = path.join(releasesDir, file);
      const stats = fs.statSync(filePath);
      const size = (stats.size / 1024 / 1024).toFixed(1);
      console.log(`   ${file} (${size} MB)`);
    });
  }
} catch (error) {
  console.error('❌ Production build failed:', error.message);
  process.exit(1);
} 