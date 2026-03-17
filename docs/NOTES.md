# CS314 Chat App Notes

**Source of truth:** `docs/Backend API spec copy.pdf` — REST endpoints, Socket.IO events (§7), and auth.

Backend server (ngrok):
https://pretorial-portliest-vertie.ngrok-free.dev

Important:
- Frontend is a Vite + React + TypeScript SPA
- Must use axios with `withCredentials: true`
- Must include header: ngrok-skip-browser-warning: "true"
- Real-time messaging uses Socket.IO
- Authentication is cookie-based (JWT in cookies)

## Socket.IO + Vite proxy

So the backend receives requests correctly and Socket.IO stays connected:

1. **Client** (`src/lib/socket.ts`): Connect to same origin (`""`) so the browser sends requests to the Vite dev server, not directly to ngrok. Use `path: "/socket.io"` (Socket.IO default), `withCredentials: true` (send cookies for auth), and `extraHeaders` + `transportOptions.polling.extraHeaders` with `ngrok-skip-browser-warning: "true"`. In the browser, custom headers are not sent on the WebSocket upgrade; they are sent on the polling transport, and the Vite proxy adds the header to all forwarded requests.

2. **Vite proxy** (`vite.config.js`): Proxy `/socket.io` (and `/api`) to the ngrok backend with `ws: true` so both HTTP polling and WebSocket upgrade are proxied. Set `changeOrigin: true` and the same `headers` so every proxied request (including the WS upgrade) includes `ngrok-skip-browser-warning: "true"`.