import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El host 0.0.0.0 permite acceder desde otros dispositivos en la LAN.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
