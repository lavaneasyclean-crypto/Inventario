import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Lo resuelve Next, no existe como paquete: sin esto no se puede
      // importar nada de src/lib/data desde un test.
      "server-only": fileURLToPath(
        new URL("./src/lib/testing/server-only.ts", import.meta.url),
      ),
    },
  },
});
