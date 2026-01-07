module.exports = function (api) {
  api.cache(true);

  const isTest = process.env.NODE_ENV === 'test';

  return {
    presets: ['babel-preset-expo'],
    // Exclude reanimated plugin during tests to avoid worklets dependency
    plugins: isTest ? [] : ['react-native-reanimated/plugin'],
  };
};
