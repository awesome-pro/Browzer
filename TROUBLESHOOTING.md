# Browzer Troubleshooting Guide

## macOS App Translocation Issue

### Problem
When running Browzer for the first time on macOS, you might see this error:
```
OSError: [Errno 30] Read-only file system: /private/var/folders/.../AppTranslocation/.../topic_agent.log
```

### Cause
macOS App Translocation moves downloaded apps to a temporary quarantine folder with read-only permissions, preventing the Python extensions from writing log files.

### Solution

**Option 1: Move the app to Applications folder**
1. Quit Browzer completely
2. Move `Browzer.app` from Downloads to `/Applications` folder
3. Launch Browzer from Applications folder

**Option 2: Remove quarantine attribute**
```bash
# Navigate to where Browzer.app is located (e.g., Downloads)
cd ~/Downloads

# Remove quarantine attribute
xattr -d com.apple.quarantine Browzer.app

# Launch Browzer
open Browzer.app
```

**Option 3: Clear quarantine completely**
```bash
# Remove all extended attributes
xattr -c Browzer.app

# Launch Browzer
open Browzer.app
```

### Verification
After applying any solution:
1. Launch Browzer
2. Try using the Ask feature
3. The error should be resolved

### Additional Notes
- This only affects the first launch after downloading
- Moving to Applications folder is the recommended permanent solution
- The app will work normally after resolving the translocation issue

## Other Common Issues

### Python Bundle Issues
If you see Python-related errors, try:
1. Restart Browzer completely
2. Check that Python extensions are enabled in Settings
3. Ensure you have sufficient disk space

### Network Issues
If Ask feature fails with network errors:
1. Check your internet connection
2. Verify firewall settings aren't blocking Browzer
3. Try disabling VPN temporarily

---

For more help, check the Browzer documentation or contact support.
