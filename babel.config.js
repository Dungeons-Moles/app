module.exports = function (api) {
  api.cache(true);

  const isTest = process.env.NODE_ENV === 'test';
  const isProduction = process.env.NODE_ENV === 'production';

  const plugins = [];

  if (isProduction) {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }

  if (!isTest) {
    plugins.push('react-native-reanimated/plugin');
  }

  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins,
  };
};
