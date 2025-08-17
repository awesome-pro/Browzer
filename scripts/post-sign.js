const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping post-sign - not macOS platform');
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  
  console.log('🔧 Post-sign: Fixing Python binaries...');
  
  // Find and fix Python .so files
  const pythonBundlePath = path.join(appPath, 'Contents', 'Resources', 'python-bundle');
  
  if (fs.existsSync(pythonBundlePath)) {
    // Find all .so files
    const findCommand = `find "${pythonBundlePath}" -name "*.so" -type f`;
    try {
      const soFiles = execSync(findCommand, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      
      console.log(`Found ${soFiles.length} Python binary files to fix`);
      
      for (const soFile of soFiles) {
        console.log(`  Removing signature from: ${path.basename(soFile)}`);
        try {
          execSync(`codesign --remove-signature "${soFile}"`, { stdio: 'pipe' });
        } catch (error) {
          console.warn(`  Warning: Could not remove signature from ${soFile}`);
        }
      }
      
      console.log('✅ Python binaries fixed');
    } catch (error) {
      console.error('❌ Error fixing Python binaries:', error.message);
    }
  } else {
    console.log('⚠️  Python bundle not found at:', pythonBundlePath);
  }
  
  // Now run notarization
  console.log('🍎 Starting notarization...');
  
  // Skip notarization for unsigned builds
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    console.log('Skipping notarization - unsigned build (CSC_IDENTITY_AUTO_DISCOVERY=false)');
    return;
  }

  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('Skipping notarization - missing environment variables');
    console.log('Required: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID');
    return;
  }

  const { notarize } = require('@electron/notarize');
  
  try {
    await notarize({
      appBundleId: 'com.browzer.app',
      appPath: appPath,
      tool: 'notarytool',
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    });
    console.log('✅ Notarization completed successfully!');
  } catch (error) {
    console.error('❌ Notarization failed:', error);
    throw error;
  }
};
