import type { StorybookConfig } from "@storybook/react-native";

const main: StorybookConfig = {
  stories: ["./stories/**/*.stories.?(ts|tsx)"],
  deviceAddons: ["@storybook/addon-ondevice-actions"],
};

export default main;
