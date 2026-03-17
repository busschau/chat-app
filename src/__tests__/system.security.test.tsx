/**
 * System and security tests for the chat frontend.
 * Verifies: auth-only /app, message validation, XSS safety, socket disconnect on logout, loading state.
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import AppPage from "../pages/AppPage";
import { AuthProvider } from "../context/AuthContext";
import apiClient from "../lib/apiClient";
import * as socketModule from "../lib/socket";

jest.mock("../lib/apiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

let receiveMessageHandler: ((raw: unknown) => void) | null = null;

const mockSocket = {
  connected: true,
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn((event: string, cb: (raw: unknown) => void) => {
    if (event === "receiveMessage") receiveMessageHandler = cb;
  }),
  off: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
};

jest.mock("../lib/socket", () => ({
  connectSocket: jest.fn(() => mockSocket),
  disconnectSocket: jest.fn(),
}));

const currentUserId = "user-1";
const contacts = [{ _id: "c1", firstName: "Bob", lastName: "B", username: "bob" }];

function renderApp(initialEntry = "/login") {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </AuthProvider>
  );
}

function setupAppPageMocks() {
  (apiClient.get as jest.Mock).mockImplementation((url: string) => {
    if (url === "/api/auth/userinfo") {
      return Promise.resolve({
        data: {
          user: {
            id: currentUserId,
            _id: currentUserId,
            username: "alice",
            firstName: "Alice",
            lastName: "A",
          },
        },
      });
    }
    return Promise.resolve({ data: { contacts } });
  });
  (apiClient.post as jest.Mock).mockResolvedValue({ data: { messages: [] } });
}

function renderAppPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/app"]}>
        <AppPage />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("System and security", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    receiveMessageHandler = null;
  });

  describe("authentication", () => {
    it("users cannot access /app without authentication", async () => {
      (apiClient.get as jest.Mock).mockRejectedValue(new Error("Unauthorized"));

      renderApp("/app");

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
      });

      expect(screen.queryByRole("heading", { name: /chats/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
    });
  });

  describe("message input", () => {
    it("rejects empty or whitespace-only messages", async () => {
      setupAppPageMocks();
      renderAppPage();

      await waitFor(() => {
        expect(screen.getByText(/bob/i)).toBeInTheDocument();
      });
      await userEvent.click(screen.getByText(/bob/i));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
      });

      const sendButton = screen.getByRole("button", { name: /send/i });
      expect(sendButton).toBeDisabled();

      const input = screen.getByPlaceholderText(/type a message/i);
      await userEvent.type(input, "   ");
      expect(sendButton).toBeDisabled();

      await userEvent.clear(input);
      await userEvent.type(input, "  \t\n  ");
      expect(sendButton).toBeDisabled();

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe("XSS prevention", () => {
    it("renders malicious HTML as plain text and does not execute script", async () => {
      setupAppPageMocks();
      renderAppPage();

      await waitFor(() => {
        expect(screen.getByText(/bob/i)).toBeInTheDocument();
      });
      await userEvent.click(screen.getByText(/bob/i));

      await waitFor(() => {
        expect(receiveMessageHandler).not.toBeNull();
      });

      const maliciousContent = "<script>alert(1)</script>";
      act(() => {
        receiveMessageHandler!({
          sender: { _id: "c1" },
          recipient: { _id: currentUserId },
          content: maliciousContent,
          _id: "msg-xss",
          timestamp: Date.now(),
        });
      });

      await waitFor(() => {
        expect(screen.getByText(maliciousContent)).toBeInTheDocument();
      });

      const scripts = document.querySelectorAll("script");
      const scriptWithAlert = Array.from(scripts).find(
        (s) => s.textContent?.includes("alert(1)") && !s.src
      );
      expect(scriptWithAlert).toBeUndefined();
    });
  });

  describe("socket on logout", () => {
    it("socket connection disconnects on logout", async () => {
      (apiClient.get as jest.Mock)
        .mockRejectedValueOnce(new Error("no session"))
        .mockResolvedValue({ data: { user: { id: "1", username: "alice" } } });
      (apiClient.post as jest.Mock)
        .mockResolvedValueOnce({ data: { user: { id: "1", username: "alice" } } })
        .mockResolvedValueOnce({});

      renderApp("/login");

      await userEvent.type(screen.getByLabelText(/username or email/i), "alice");
      await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
      await userEvent.click(screen.getByRole("button", { name: /^login$/i }));

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /chats/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /logout/i }));

      await waitFor(() => {
        expect(socketModule.disconnectSocket).toHaveBeenCalled();
      });
    });
  });

  describe("protected route loading state", () => {
    it("protected UI is not rendered while authentication state is still loading", async () => {
      (apiClient.get as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      );

      renderApp("/app");

      expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
      expect(screen.queryByRole("heading", { name: /chats/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /welcome back/i })).not.toBeInTheDocument();

      await waitFor(
        () => {
          expect(screen.queryByRole("heading", { name: /chats/i })).not.toBeInTheDocument();
        },
        { timeout: 500 }
      );
    });
  });
});
