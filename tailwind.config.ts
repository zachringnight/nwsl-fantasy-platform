import type { Config } from "tailwindcss";
import designTokens from "./src/config/design-tokens.json";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./docs/**/*.{md,mdx}"],
  theme: {
    extend: {
      colors: {
        background: designTokens.color.background,
        foreground: designTokens.color.foreground,
        panel: designTokens.color.panel,
        brand: designTokens.color.brand,
        "brand-strong": designTokens.color.brandStrong,
        accent: designTokens.color.accent,
        "accent-soft": designTokens.color.accentSoft,
        muted: designTokens.color.muted,
        line: designTokens.color.line,
        success: designTokens.color.success,
        warning: designTokens.color.warning,
        danger: designTokens.color.danger,
        info: designTokens.color.info,
      },
      fontFamily: {
        sans: [designTokens.typography.fontBody],
        display: [designTokens.typography.fontDisplay],
        mono: [designTokens.typography.fontMono],
      },
      boxShadow: {
        card: designTokens.shadow.card,
      },
      borderRadius: {
        sm: designTokens.radius.sm,
        md: designTokens.radius.md,
        lg: designTokens.radius.lg,
        xl: designTokens.radius.xl,
        pill: designTokens.radius.pill,
      },
      transitionDuration: {
        fast: designTokens.motion.fast,
        base: designTokens.motion.base,
        slow: designTokens.motion.slow,
      },
    },
  },
};

export default config;
