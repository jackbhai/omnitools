# OmniTools APK Build Guide

## How to Build Android APK from OmniTools Web App

### Prerequisites (One-time Setup)

#### Option 1: Using Android Studio (Recommended)
1. **Download Android Studio**: https://developer.android.com/studio
2. **Install Android Studio** and open it
3. **Install Android SDK** (Studio will prompt you)
4. **Accept all licenses**

#### Option 2: Using Command Line Only
1. **Install Java JDK 17+**: https://adoptium.net/
2. **Install Android SDK Command-line Tools**: https://developer.android.com/studio#command-line-tools-only
3. **Set ANDROID_HOME environment variable**:
   ```bash
   # Linux/Mac
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
   
   # Windows (PowerShell)
   $env:ANDROID_HOME = "$env:USERPROFILE\Android\Sdk"
   $env:PATH += ";$env:ANDROID_HOME\tools;$env:ANDROID_HOME\platform-tools"
   ```

---

### Build APK - Step by Step

#### Step 1: Install Dependencies
```bash
cd omnitools
npm install
```

#### Step 2: Build Web App
```bash
npm run build
```

#### Step 3: Sync with Android
```bash
npx cap sync android
```

#### Step 4: Build APK

##### Method A: Using Android Studio (Easiest)
1. Open Android Studio
2. Click **File → Open**
3. Select the `omnitools/android` folder
4. Wait for Gradle sync to complete
5. Click **Build → Build Bundle(s) / APK(s) → Build APK(s)**
6. APK will be in `android/app/build/outputs/apk/debug/app-debug.apk`

##### Method B: Using Command Line
```bash
cd android
./gradlew assembleDebug
```

APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

##### Method C: Build Release APK (for Play Store)
```bash
cd android
./gradlew assembleRelease
```

APK location: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

**Note:** Release APK needs to be signed before installing. See "Signing APK" section below.

---

### Install APK on Phone

#### Method 1: USB Transfer
1. Copy `app-debug.apk` to your phone
2. Open file manager on phone
3. Tap the APK file
4. Allow "Install from unknown sources" if prompted
5. Tap **Install**

#### Method 2: Direct Install via ADB
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

#### Method 3: Run directly from Android Studio
1. Connect phone via USB
2. Enable USB debugging on phone
3. In Android Studio, click the green **Run** button

---

### Signing APK (for Release/Play Store)

#### Step 1: Generate Keystore
```bash
keytool -genkey -v -keystore omnitools-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias omnitools
```

#### Step 2: Sign APK
```bash
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore omnitools-release-key.jks android/app/build/outputs/apk/release/app-release-unsigned.apk omnitools
```

#### Step 3: Align APK
```bash
zipalign -v 4 android/app/build/outputs/apk/release/app-release-unsigned.apk OmniTools-v1.0.apk
```

---

### One-Command Build Script

Create a file `build-apk.sh`:

```bash
#!/bin/bash
echo "=== OmniTools APK Builder ==="

echo "1. Installing dependencies..."
npm install

echo "2. Building web app..."
npm run build

echo "3. Syncing with Android..."
npx cap sync android

echo "4. Building debug APK..."
cd android
./gradlew assembleDebug

echo ""
echo "=== BUILD COMPLETE ==="
echo "APK Location: android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "To install on connected device:"
echo "  adb install android/app/build/outputs/apk/debug/app-debug.apk"
```

Make it executable:
```bash
chmod +x build-apk.sh
./build-apk.sh
```

---

### Troubleshooting

#### Error: "SDK location not found"
- Set ANDROID_HOME environment variable
- Or create `android/local.properties` file with: `sdk.dir=/path/to/Android/Sdk`

#### Error: "Java version mismatch"
- Install Java 17: `sudo apt install openjdk-17-jdk`
- Set JAVA_HOME: `export JAVA_HOME=/usr/lib/jvm/java-17-openjdk`

#### Error: "Gradle sync failed"
- In Android Studio: **File → Invalidate Caches / Restart**
- Delete `.gradle` folder and retry

#### APK crashes on launch
- Check `adb logcat` for errors
- Make sure web build is successful: `npm run build`
- Re-sync: `npx cap sync android`

#### White screen / blank app
- Web assets not synced properly
- Run: `npx cap copy android` then `npx cap sync android`

---

### App Configuration

#### Change App Name
Edit `android/app/src/main/res/values/strings.xml`:
```xml
<string name="app_name">OmniTools</string>
<string name="title_activity_main">OmniTools</string>
```

#### Change Package Name
Edit `capacitor.config.json`:
```json
{
  "appId": "com.yourname.omnitools",
  "appName": "OmniTools"
}
```

Then re-add Android platform:
```bash
npx cap remove android
npx cap add android
npx cap sync android
```

#### Change App Icon
1. Create 512x512 PNG icon
2. Use https://icon.kitchen/ to generate all sizes
3. Replace files in `android/app/src/main/res/mipmap-*/`

#### Change Splash Screen
Edit `capacitor.config.json`:
```json
{
  "plugins": {
    "SplashScreen": {
      "backgroundColor": "#7c2d12",
      "showSpinner": false
    }
  }
}
```

---

### Quick Reference Commands

```bash
# Build web app
npm run build

# Sync to Android
npx cap sync android

# Open in Android Studio
npx cap open android

# Build debug APK
cd android && ./gradlew assembleDebug

# Build release APK
cd android && ./gradlew assembleRelease

# Install on device
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Run on device
cd android && ./gradlew run

# View logs
adb logcat

# Clean build
cd android && ./gradlew clean
```

---

### Publishing to Play Store

1. **Build signed release APK** (see Signing section)
2. **Create Play Store listing**:
   - App name, description, screenshots
   - Privacy policy URL
   - Category: Tools/Productivity
3. **Upload AAB** (Android App Bundle) instead of APK:
   ```bash
   cd android && ./gradlew bundleRelease
   ```
   Location: `android/app/build/outputs/bundle/release/app-release.aab`
4. **Submit for review** (takes 1-7 days)

---

### Alternative: Online APK Builders

If you don't want to install Android Studio, use these online services:

1. **Median.co** (formerly GoNative)
   - Upload web app URL
   - Generates APK automatically
   - Free tier available

2. **AppsGeyser**
   - Free APK builder
   - Upload HTML/JS files
   - Generates APK in minutes

3. **WebIntoApp**
   - Convert any website to APK
   - Custom icons and splash screen
   - Free and paid plans

---

### Support

- Capacitor Docs: https://capacitorjs.com/docs
- Android Studio: https://developer.android.com/studio
- OmniTools GitHub: https://github.com/jackbhai/omnitools

---

**Build Time:** ~5-10 minutes (first build), ~1-2 minutes (subsequent builds)
**APK Size:** ~15-20 MB (includes web app + Android runtime)
**Minimum Android:** Android 5.0 (API 22)
**Target Android:** Android 14 (API 34)
