const React = require('react');
module.exports = {
  Canvas: ({ children }) => React.createElement('Canvas', {}, children),
  Circle: () => React.createElement('Circle'),
  Group: ({ children }) => React.createElement('Group', {}, children),
  Rect: () => React.createElement('Rect'),
  Path: () => React.createElement('Path'),
  Skia: {
    Color: () => '#000000',
  },
  useFont: () => ({}),
  vec: (x, y) => ({ x, y }),
};
