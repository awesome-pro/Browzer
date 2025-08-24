const { notarize } = require('@electron/notarize');

exports.default = async function (context) {
  const { appOutDir, electronPlatformName, packager } = context;
  
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization - not macOS platform');
    return;
  }

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

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`🍎 Starting notarization for ${appName}...`);
  console.log(`App path: ${appPath}`);

  try {
    await notarize({
      appBundleId: 'com.browzer.app',
      appPath: appPath,
      tool: 'notarytool', // modern tool
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
