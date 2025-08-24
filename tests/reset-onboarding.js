#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Function to get userData path (same logic as Electron)
function getUserDataPath() {
  const appName = 'Browzer';
  
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', appName);
    case 'win32':
      return path.join(os.homedir(), 'AppData', 'Roaming', appName);
    case 'linux':
      return path.join(os.homedir(), '.config', appName);
    default:
      return path.join(os.homedir(), `.${appName.toLowerCase()}`);
  }
}

function resetOnboarding() {
  console.log('🔄 Resetting Browzer onboarding state...\n');
  
  const userDataPath = getUserDataPath();
  console.log(`📁 User data path: ${userDataPath}`);
  
  // Files to delete for onboarding reset
  const filesToDelete = [
    '.browzer-first-run',
    'settings.json',
    'users.json',           // Clear user accounts
    'sessions.json',        // Clear user sessions
    'verified-users.json',  // Clear verified users
    'email-config.json',    // Clear email configuration
    'api-keys.json'         // Clear API keys (optional)
  ];
  
  let deletedFiles = [];
  let notFoundFiles = [];
  
  filesToDelete.forEach(filename => {
    const filePath = path.join(userDataPath, filename);
    
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deletedFiles.push(filename);
        console.log(`✅ Deleted: ${filename}`);
      } else {
        notFoundFiles.push(filename);
        console.log(`ℹ️  Not found: ${filename}`);
      }
    } catch (error) {
      console.error(`❌ Error deleting ${filename}:`, error.message);
    }
  });
  
  console.log(`\n📊 Summary:`);
  console.log(`   Deleted: ${deletedFiles.length} files`);
  console.log(`   Not found: ${notFoundFiles.length} files`);
  
  if (deletedFiles.length > 0) {
    console.log(`\n🎉 Onboarding state reset successfully!`);
    console.log(`   Run 'npm run dev' to see the onboarding flow again.`);
  } else {
    console.log(`\n💡 No onboarding files found - onboarding should already show up.`);
  }
  
  console.log(`\n🔍 If onboarding still doesn't show up, check:`);
  console.log(`   1. Make sure Browzer is completely closed`);
  console.log(`   2. Clear browser cache if needed`);
  console.log(`   3. Check console for any errors`);
}

// Run the reset function
if (require.main === module) {
  resetOnboarding();
}

module.exports = { resetOnboarding, getUserDataPath };
