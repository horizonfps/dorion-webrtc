import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["services/**/*.test.ts", "src-tauri/injection/**/*.test.ts"],
  },
});
