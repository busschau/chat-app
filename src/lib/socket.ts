import { io, Socket } from "socket.io-client";

/** Same-origin so Vite proxy forwards to backend; auth cookie is sent with the handshake. */
const SERVER_URL = "";

const NGROK_HEADERS = { "ngrok-skip-browser-warning": "true" };

let socket: Socket | null = null;

/**
 * Connect to the backend. Backend requires userId in the handshake to associate
 * the socket with the user and emit receiveMessage to the right recipient.
 */
export const connectSocket = (userId: string): Socket => {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      withCredentials: true,
      path: "/socket.io",
      query: { userId },
      extraHeaders: NGROK_HEADERS,
      // In the browser, extraHeaders are not sent on the WebSocket upgrade request.
      // Sending them on polling ensures the initial handshake gets the header;
      // Vite proxy adds the same header to all proxied requests (including WS).
      transportOptions: {
        polling: {
          extraHeaders: NGROK_HEADERS,
        },
      },
    });
  }

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
};

export const disconnectSocket = (): void => {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
};
