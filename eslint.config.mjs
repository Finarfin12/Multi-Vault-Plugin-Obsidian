// eslint.config.mjs
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },
  {
    // Keep the review bot's strictest type-safety rules as errors locally (F15)
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
    },
  },
]);
