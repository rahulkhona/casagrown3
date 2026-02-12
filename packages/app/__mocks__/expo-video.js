// Mock for expo-video used in tests (kept for compatibility)
const React = require('react');

const VideoView = React.forwardRef((props, ref) =>
  React.createElement('VideoView', { ...props, ref })
);

const useVideoPlayer = (source, configure) => {
  const player = {
    loop: false,
    muted: false,
    playing: false,
    play: jest.fn(),
    pause: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  if (configure) configure(player);
  return player;
};

module.exports = {
  VideoView,
  useVideoPlayer,
};
