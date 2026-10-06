import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "public-web",
  base: "/tierra-viva-3d/",
  plugins: [react()],
  build: {
    outDir: "../public-dist",
    emptyOutDir: true,
  },
});
