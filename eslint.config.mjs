import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The current data-client architecture intentionally triggers async
      // refresh functions from effects. Keep the React 19 diagnostic visible
      // while a future query-cache migration removes those loader effects.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "tmp/**",
    "nwsl-model/data/raw/**",
    "nwsl-model/.venv/**",
    "nwsl-model/*.egg-info/**",
  ]),
]);

export default eslintConfig;
