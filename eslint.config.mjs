import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Compiled Cloud Functions output
    "functions/lib/**",
  ]),
  // Custom rule overrides
  {
    rules: {
      // Disable overly strict setState-in-effect rule
      // This pattern is valid for syncing with external data sources (Firestore, localStorage)
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
