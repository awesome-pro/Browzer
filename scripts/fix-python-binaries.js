#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

console.log('🔧 Fixing Python binary signatures...');

// Function to strip signature from a file
function stripSignature(filePath) {
  try {
    console.log(`  Stripping signature from: ${path.basename(filePath)}`);
    execSync(`codesign --remove-signature "${filePath}"`, { stdio: 'pipe' });
    return true;
  } catch (error) {
    console.error(`  Failed to strip signature from ${filePath}:`, error.message);
    return false;
  }
}

// Function to find all .so files in Python bundle
function findPythonBinaries(appPath) {
  const pythonBundlePath = path.join(appPath, 'Contents', 'Resources', 'python-bundle');
  
  if (!fs.existsSync(pythonBundlePath)) {
    console.log('❌ Python bundle not found at:', pythonBundlePath);
    return [];
  }
  
  const pattern = path.join(pythonBundlePath, '**/*.so');
  const files = glob.sync(pattern);
  
  console.log(`Found ${files.length} Python binary files to fix`);
  return files;
}

// Main function
function fixPythonBinaries(appPath) {
  console.log('📍 App path:', appPath);
  
  const binaries = findPythonBinaries(appPath);
  
  if (binaries.length === 0) {
    console.log('⚠️  No Python binaries found to fix');
    return;
  }
  
  let fixed = 0;
  for (const binary of binaries) {
    if (stripSignature(binary)) {
      fixed++;
    }
  }
  
  console.log(`✅ Fixed ${fixed}/${binaries.length} Python binaries`);
}

// Hook for electron-builder afterSign
exports.default = async function(context) {
  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  
  console.log('🐍 Post-sign hook: Fixing Python binaries...');
  fixPythonBinaries(appPath);
};

// Allow running directly for testing
if (require.main === module) {
  const appPath = process.argv[2];
  if (!appPath) {
    console.error('Usage: node fix-python-binaries.js <path-to-app>');
    process.exit(1);
  }
  fixPythonBinaries(appPath);
}
