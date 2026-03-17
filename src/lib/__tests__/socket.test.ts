import { connectSocket, disconnectSocket } from "../socket";

const mockSocket = {
  connected: false,
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
};

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => mockSocket),
}));

describe("socket", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.connected = false;
    mockSocket.connect.mockImplementation(() => {
      mockSocket.connected = true;
    });
    mockSocket.disconnect.mockImplementation(() => {
      mockSocket.connected = false;
    });
    disconnectSocket();
  });

  describe("connectSocket", () => {
    it("creates socket with userId in query and returns it", () => {
      const { io } = require("socket.io-client");

      const result = connectSocket("user-123");

      expect(io).toHaveBeenCalledWith(
        "",
        expect.objectContaining({
          autoConnect: false,
          withCredentials: true,
          path: "/socket.io",
          query: { userId: "user-123" },
          extraHeaders: expect.any(Object),
          transportOptions: expect.any(Object),
        })
      );
      expect(result).toBe(mockSocket);
    });

    it("calls connect when socket is not connected", () => {
      connectSocket("user-1");

      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it("reuses same socket instance on second call", () => {
      const first = connectSocket("user-1");
      const second = connectSocket("user-2");

      expect(first).toBe(second);
    });
  });

  describe("disconnectSocket", () => {
    it("calls disconnect on the socket", () => {
      connectSocket("user-1");
      disconnectSocket();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it("does not throw when no socket exists", () => {
      expect(() => disconnectSocket()).not.toThrow();
    });
  });
});
