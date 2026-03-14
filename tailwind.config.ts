import type { Config } from "tailwindcss";

/*
 * Colors, fonts, and shadows are defined via @theme inline in globals.css
 * (the Tailwind v4 canonical source). This config only extends values that
 * cannot be expressed in CSS @theme blocks.
 *
 * Design tokens are kept in src/config/design-tokens.json and
 * src/config/design-tokens.ts for programmatic access (e.g. Storybook,
 * server-side utilities), but they are NOT imported here to avoid
 * conflicting with the @theme inline definitions.
 */

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./docs/**/*.{md,mdx}"],
  theme: {
    extend: {
      transitionDuration: {
        fast: "140ms",
        base: "220ms",
        slow: "360ms",
      },
    },
  },
};

export default config;
