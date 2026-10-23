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
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local AI tooling is outside the application (also excluded by .gitignore).
    ".understand-anything/**",
    "understand-anything/**",
    ".mem0/**",
    "mem0/**",
    // Supabase CLI downloads generated service code here.
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
