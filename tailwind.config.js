/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("@sincpro/mobile-ui/tailwind.preset")],
  content: [
    "./.rnstorybook/**/*.{ts,tsx}",
    "./sincpro_mobile/**/*.{ts,tsx}",
    "./node_modules/@sincpro/mobile-ui/dist/**/*.js",
  ],
};
