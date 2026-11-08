module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@sincpro/mobile": "./sincpro_mobile",
          },
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
        },
      ],
      "react-native-worklets/plugin",
    ],
  };
};
