# Browzer Production Build Guide

This guide covers building production executables for Browzer with clean logging and proper distribution packages.

## Prerequisites

1. **Node.js** (v18 or higher)
2. **Python** (v3.9 or higher) with virtual environment
3. **Platform-specific tools:**
   - **macOS**: Xcode Command Line Tools
   - **Windows**: Visual Studio Build Tools or Visual Studio
   - **Linux**: Standard build tools (gcc, g++, make)

## Quick Start

### Build for Current Platform
```bash
npm run release
```

### Build DMG for macOS
```bash
npm run build:prod:mac
```

### Build for All Platforms
```bash
npm run release:all
```

## Build Commands Reference

| Command | Description | Output |
|---------|-------------|---------|
| `npm run release` | Build for current platform (production) | Platform-specific executable |
| `npm run build:prod:mac` | Build macOS DMG and ZIP | `.dmg` and `.zip` files |
| `npm run build:prod:mac-universal` | Build universal macOS binary | Universal `.dmg` for Intel + Apple Silicon |
| `npm run build:prod:linux` | Build Linux packages | `.AppImage`, `.deb`, `.rpm`, `.tar.gz` |
| `npm run build:prod:win` | Build Windows installer | `.exe` installer and portable |
| `npm run release:all` | Build for all platforms | All platform executables |

## Build Process

The production build process includes:

1. **Environment Setup**: Sets `NODE_ENV=production`
2. **Code Compilation**: TypeScript and Webpack compilation with optimizations
3. **Asset Processing**: Python files and dependencies
4. **Log Cleanup**: Console logs disabled in production builds
5. **Executable Generation**: Platform-specific packaging with electron-builder

## Logging System

Browzer uses a centralized logging system that automatically:
- **Development**: Shows all debug logs and console output
- **Production**: Only shows error logs, all debug logs disabled

### Migration from console.log

Replace existing `console.log` statements with the new logging system:

```typescript
// Old
console.log('[Component] Debug message');

// New
import { logDebug } from '@shared/Logger';
logDebug('Component', 'Debug message');
```

## Output Directory Structure

Built executables are saved to the `releases/` directory:

```
releases/
├── Browzer-1.0.0.dmg              # macOS DMG installer
├── Browzer-1.0.0-mac.zip          # macOS ZIP archive
├── Browzer-1.0.0.AppImage          # Linux AppImage
├── Browzer-1.0.0.deb               # Linux Debian package
├── Browzer-1.0.0.rpm               # Linux RPM package
├── Browzer Setup 1.0.0.exe        # Windows installer
└── Browzer 1.0.0.exe               # Windows portable
```

## Platform-Specific Notes

### macOS
- **DMG Creation**: Creates a drag-to-install DMG with custom background
- **Code Signing**: Uses entitlements from `assets/entitlements.mac.plist`
- **Universal Builds**: Use `build:prod:mac-universal` for Intel + Apple Silicon

### Windows
- **NSIS Installer**: Creates user-friendly installer with desktop shortcuts
- **Portable Version**: Also creates a portable executable
- **Icons**: Uses `assets/icon.ico`

### Linux
- **Multiple Formats**: Builds AppImage, DEB, RPM, and TAR.GZ
- **AppImage**: Recommended for universal Linux distribution
- **System Integration**: DEB/RPM packages integrate with system package managers

## Assets Required

Ensure these assets exist in the `assets/` directory:

- `icon.icns` - macOS app icon
- `icon.ico` - Windows app icon  
- `icon.png` - Linux app icon
- `entitlements.mac.plist` - macOS entitlements
- `dmg-background.png` - DMG background (540x380px)

## Troubleshooting

### Common Issues

1. **Python Not Found**
   ```bash
   npm run setup  # Set up Python environment
   ```

2. **Missing Dependencies**
   ```bash
   npm install
   npm run rebuild
   ```

3. **Build Fails on macOS**
   ```bash
   # Install Xcode Command Line Tools
   xcode-select --install
   ```

4. **DMG Background Missing**
   - The build will use a default background if `dmg-background.png` is missing
   - Create a 540x380px PNG for custom DMG appearance

### Clean Build

If you encounter issues, try a clean build:

```bash
npm run clean
npm install
npm run setup
npm run release
```

## Development vs Production

| Feature | Development | Production |
|---------|-------------|------------|
| Console Logs | ✅ Enabled | ❌ Disabled |
| Source Maps | ✅ Enabled | ❌ Disabled |
| Code Minification | ❌ Disabled | ✅ Enabled |
| File Size | Larger | Optimized |
| Build Speed | Faster | Slower (optimized) |

## Distribution

Once built, you can distribute the executables:

1. **macOS**: Upload the `.dmg` file for easy installation
2. **Windows**: Distribute the `.exe` installer
3. **Linux**: Provide the `.AppImage` for universal compatibility

The executables are self-contained and don't require additional installations. 