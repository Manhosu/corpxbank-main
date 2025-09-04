const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Completely disable Hermes
config.transformer = {
  ...config.transformer,
  hermesParser: false,
  enableHermes: false,
};

// Force JSC usage
config.resolver = {
  ...config.resolver,
  platforms: ['ios', 'android', 'native', 'web'],
  // Resolve module conflicts for React Native 0.79.x
  resolverMainFields: ['react-native', 'browser', 'main'],
  sourceExts: ['js', 'jsx', 'ts', 'tsx', 'json'],
  // Blacklist problematic modules that cause redefinition
  blockList: [
    /.*\/node_modules\/.*\/node_modules\/react-native\/.*/,
  ],
};

// Additional transformer settings
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: {
    keep_fnames: true,
  },
};

module.exports = config;