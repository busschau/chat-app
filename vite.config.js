
/*import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
  */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    // Use HTTPS so Secure cookies work on localhost.
    https: true,
    proxy: {
      "/api": {
        target: "https://pretorial-portliest-vertie.ngrok-free.dev",
        changeOrigin: true,
        secure: true,
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      },
      // Socket.IO: proxy both HTTP polling and WebSocket upgrade; add ngrok header to all requests
      "/socket.io": {
        target: "https://pretorial-portliest-vertie.ngrok-free.dev",
        changeOrigin: true,
        secure: true,
        ws: true,
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      },
    },
  },
});