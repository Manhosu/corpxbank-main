# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **CorpxBank**, a React Native mobile banking application built with Expo. The app provides secure access to banking services through a WebView-based interface with biometric authentication.

### Key Architecture Components

- **App.js**: Main entry point with navigation setup using React Navigation Stack
- **CorpxWebViewScreen.js**: Core component managing the banking WebView, authentication flow, and secure storage
- **SplashScreen.js**: Loading screen shown during app initialization and biometric authentication
- **ErrorBoundary.js**: Error handling wrapper for crash recovery

### Authentication Flow

The app implements a sophisticated authentication system:

1. **Biometric Authentication**: Uses Expo LocalAuthentication for Face ID/Touch ID/Fingerprint
2. **Secure Storage**: Credentials stored using Expo SecureStore with 30-day expiry
3. **Auto-Login**: JavaScript injection for automatic form filling after biometric verification
4. **Session Management**: Handles login state persistence and secure logout

## Development Commands

### Starting the App
```bash
npm start                 # Start Expo development server
npm run android          # Run on Android device/emulator
npm run ios              # Run on iOS device/simulator
npm run web              # Run in web browser
```

### Building the App
Use EAS Build for production builds:

```bash
# Install EAS CLI globally if not already installed
npm install -g eas-cli

# Development build
eas build --profile development --platform android
eas build --profile development --platform ios

# Preview/testing build
eas build --profile preview --platform android
eas build --profile preview --platform ios

# Production build
eas build --profile production --platform android
eas build --profile production --platform ios
```

### EAS Build Profiles (from eas.json)
- **development**: Development client builds with internal distribution
- **preview**: APK builds for testing (Android), internal distribution
- **production**: Production builds for app stores
- **ios-test**: iOS-specific testing builds

## Project Structure

```
CorpxBank/
├── assets/                 # App icons, splash screens, logos
├── CorpxWebViewScreen.js   # Main WebView component with authentication
├── SplashScreen.js         # Loading/splash screen component
└── ErrorBoundary.js        # Error handling component
```

## Key Dependencies

### Core Framework
- **Expo 53.0.20**: Development platform and build tools
- **React Native 0.79.5**: Mobile app framework
- **React 19.0.0**: UI library

### Authentication & Security
- **expo-local-authentication**: Biometric authentication (Face ID, Touch ID, Fingerprint)
- **expo-secure-store**: Encrypted credential storage
- **react-native-webview**: Secure WebView for banking interface

### Navigation & UI
- **@react-navigation/native**: Navigation framework
- **@react-navigation/stack**: Stack navigation
- **react-native-paper**: Material Design components
- **react-native-modal**: Modal components

## WebView Security Features

The WebView implementation includes several security measures:

1. **JavaScript Injection**: Automated form filling with credential capture
2. **2FA Handling**: Detection and handling of two-factor authentication
3. **Download Management**: Secure handling of file downloads (PDFs, CSVs)
4. **Session Persistence**: Secure cookie and session management
5. **URL Validation**: Prevents navigation to external/malicious sites

## Important Security Notes

- Credentials are stored encrypted using Expo SecureStore
- Biometric authentication has a 30-day expiry period
- The app only allows navigation within the corpxbank.com.br domain
- JavaScript injection is used only for authentication automation
- All external links (mailto, tel, SMS) are properly handled

## Platform-Specific Configurations

### iOS (app.json)
- Face ID permission: "NSFaceIDUsageDescription"
- Camera access for QR codes: "NSCameraUsageDescription" 
- Bundle identifier: "com.corpx.app"
- Uses non-exempt encryption: false

### Android (app.json)
- Package name: "com.corpx.app"
- Permissions: INTERNET, CAMERA, STORAGE, AUDIO
- Cleartext traffic allowed for development
- Edge-to-edge display enabled

## Development Guidelines

### Testing Authentication Flow
- Test biometric authentication on physical devices (simulators have limitations)
- Verify 30-day credential expiry behavior
- Test auto-login functionality across app restarts
- Validate 2FA handling when enabled on accounts

### WebView Debugging
- Enable debug mode on iOS for visual feedback (showDebug flag)
- Monitor console logs for JavaScript injection results
- Test file download functionality on both platforms

### Error Handling
- ErrorBoundary provides crash recovery with restart option
- Development builds show detailed error information
- Production builds show user-friendly error messages

## Build and Deployment

The app uses EAS Build for creating production-ready binaries. Ensure you have:

1. EAS CLI installed globally
2. Expo account configured
3. Proper certificates for iOS builds
4. Android keystore for production builds

The project is configured with the EAS project ID: "079f0c45-b6f9-446b-846d-fb98365dd4dc"