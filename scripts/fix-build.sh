#!/bin/bash

echo "🔧 Post-build fix for Python binaries"
echo "======================================"

# Check if DMG path is provided
DMG_PATH="${1:-releases/Browzer-1.0.0-arm64.dmg}"

if [ ! -f "$DMG_PATH" ]; then
    echo "❌ DMG not found: $DMG_PATH"
    exit 1
fi

echo "📦 Processing: $DMG_PATH"

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
echo "📁 Temp directory: $TEMP_DIR"

# Mount the DMG
echo "🔓 Mounting DMG..."
hdiutil attach "$DMG_PATH" -mountpoint "$TEMP_DIR/mount" -nobrowse -quiet

# Copy the app to temp location
echo "📋 Copying app..."
cp -R "$TEMP_DIR/mount/Browzer.app" "$TEMP_DIR/Browzer.app"

# Unmount original DMG
echo "🔒 Unmounting original DMG..."
hdiutil detach "$TEMP_DIR/mount" -quiet

# Copy fresh Python binaries from local bundle
echo "🐍 Replacing Python binaries with fresh copies..."
PYTHON_BUNDLE="$TEMP_DIR/Browzer.app/Contents/Resources/python-bundle"

if [ -d "$PYTHON_BUNDLE" ]; then
    # Copy the entire python-bundle from our local fresh copy
    rm -rf "$PYTHON_BUNDLE"
    cp -R "python-bundle" "$TEMP_DIR/Browzer.app/Contents/Resources/"
    echo "✅ Python bundle replaced with fresh copy"
else
    echo "❌ Python bundle not found in app"
    exit 1
fi

# Re-sign the app with ad-hoc signature for local testing
echo "🔏 Re-signing app with ad-hoc signature..."
codesign --force --deep --sign - "$TEMP_DIR/Browzer.app"

# Create a new DMG
NEW_DMG="releases/Browzer-1.0.0-arm64-fixed.dmg"
echo "💿 Creating new DMG: $NEW_DMG"

# Remove old fixed DMG if exists
rm -f "$NEW_DMG"

# Create new DMG
hdiutil create -volname "Browzer" -srcfolder "$TEMP_DIR/Browzer.app" -ov -format UDZO "$NEW_DMG"

# Clean up
echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Fixed DMG created: $NEW_DMG"
echo "📌 To install: Open the DMG and drag Browzer to Applications"
echo ""
