const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// psg1-sim lives outside the project root as a symlinked local dependency.
// Metro needs to know about it so it can resolve and watch the files.
const psg1SimPath = path.resolve(__dirname, '../../psg1-sim');

config.watchFolders = [psg1SimPath];

// Only resolve node_modules from the app — never from psg1-sim's own node_modules.
// This prevents the duplicate React problem (psg1-sim has react as a devDependency).
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

config.resolver.blockList = [
  new RegExp(path.resolve(__dirname, '../../psg1-sim/node_modules').replace(/[/\\]/g, '[/\\\\]') + '.*'),
];

module.exports = config;
