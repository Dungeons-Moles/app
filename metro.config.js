const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Worktree: node_modules is symlinked from the main app directory.
// Tell Metro to watch and resolve from the real node_modules location.
const appRoot = path.resolve(__dirname, '../../..');
config.watchFolders = [appRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(appRoot, 'node_modules'),
];

module.exports = config;
