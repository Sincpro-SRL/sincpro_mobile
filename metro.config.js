const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { withStorybook } = require("@storybook/react-native/metro/withStorybook");

const config = getDefaultConfig(__dirname);

module.exports = withStorybook(
  withNativeWind(config, {
    input: "./node_modules/@sincpro/mobile-ui/dist/theme/globals.css",
    inlineRem: 16,
  }),
  { enabled: true },
);
