/**
 * Jest tests for chat messaging features.
 * Covers: selecting contact, sending message, receiveMessage socket, unread badge,
 * contacts error, delete conversation, load messages error, search, Edit profile, message length.
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AppPage from "../AppPage";
import { AuthProvider } from "../../context/AuthContext";
import apiClient from "../../lib/apiClient";

jest.mock("../../lib/apiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

let receiveMessageHandler: ((raw: unknown) => void) | null = null;
let connectErrorHandler: ((err: { message: string }) => void) | null = null;
let disconnectHandler: ((reason: string) => void) | null = null;

const mockSocket = {
  connected: true,
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn((event: string, cb: (raw: unknown) => void) => {
    if (event === "receiveMessage") receiveMessageHandler = cb;
    if (event === "connect_error") connectErrorHandler = cb;
    if (event === "disconnect") disconnectHandler = cb;
  }),
  off: jest.fn(),
  once: jest.fn((event: string, cb: () => void) => {
    if (event === "connect") setTimeout(() => cb(), 0);
  }),
  emit: jest.fn(),
};

jest.mock("../../lib/socket", () => ({
  connectSocket: jest.fn(() => mockSocket),
  disconnectSocket: jest.fn(),
}));

const currentUserId = "user-1";
const contacts = [
  { _id: "c1", firstName: "Bob", lastName: "B", username: "bob" },
  { _id: "c2", firstName: "Carol", lastName: "C", username: "carol" },
];

function renderAppPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/app"]}>
        <AppPage />
      </MemoryRouter>
    </AuthProvider>
  );
}

function setupMocks(opts: { contactsList?: typeof contacts } = {}) {
  const list = opts.contactsList ?? contacts;
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
    return Promise.resolve({ data: { contacts: list } });
  });

  (apiClient.post as jest.Mock).mockResolvedValue({
    data: { messages: [] },
  });
}

describe("Chat messaging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    receiveMessageHandler = null;
    connectErrorHandler = null;
    disconnectHandler = null;
    setupMocks();
  });

  it("selecting a contact opens the conversation panel", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(/bob/i));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /bob/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/direct messages/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();

    expect(apiClient.post).toHaveBeenCalledWith("/api/messages/get-messages", {
      id: "c1",
    });
  });

  it("sending a message appends it to the message list", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/bob/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(input, "Hello Bob");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("Hello Bob")).toBeInTheDocument();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      "sendMessage",
      expect.objectContaining({
        sender: currentUserId,
        recipient: "c1",
        content: "Hello Bob",
        messageType: "text",
      })
    );
  });

  it("incoming messages trigger UI updates via the receiveMessage socket event", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/bob/i));

    await waitFor(() => {
      expect(receiveMessageHandler).not.toBeNull();
    });
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();

    act(() => {
      receiveMessageHandler!({
        sender: { _id: "c1" },
        recipient: { _id: currentUserId },
        content: "Hi from Bob",
        _id: "msg-1",
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Hi from Bob")).toBeInTheDocument();
    });
  });

  it("unread badge appears when a message arrives for a conversation that is not currently open", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
      expect(screen.getByText(/carol/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(/bob/i));

    await waitFor(() => {
      expect(receiveMessageHandler).not.toBeNull();
    });

    act(() => {
      receiveMessageHandler!({
        sender: { _id: "c2" },
        recipient: { _id: currentUserId },
        content: "Message for you",
        _id: "msg-2",
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      const unreadDots = document.querySelectorAll(".contact-unread-dot");
      expect(unreadDots.length).toBeGreaterThanOrEqual(1);
    });

    const carolRow = screen.getByText(/carol/i).closest("button");
    expect(carolRow).toBeDefined();
    expect(carolRow?.querySelector(".contact-unread-dot")).toBeInTheDocument();
  });

  it("unread badge clears when the conversation is opened", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
      expect(screen.getByText(/carol/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(/bob/i));

    await waitFor(() => {
      expect(receiveMessageHandler).not.toBeNull();
    });

    act(() => {
      receiveMessageHandler!({
        sender: { _id: "c2" },
        recipient: { _id: currentUserId },
        content: "Unread from Carol",
        _id: "msg-3",
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      expect(document.querySelector(".contact-unread-dot")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(/carol/i));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /carol/i })).toBeInTheDocument();
    });

    const unreadDots = document.querySelectorAll(".contact-unread-dot");
    expect(unreadDots.length).toBe(0);
  });

  it("shows error when contacts fail to load", async () => {
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
      return Promise.reject(new Error("Network error"));
    });

    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/could not load contacts/i)).toBeInTheDocument();
    });
  });

  it("Edit profile navigates to /profile", async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route path="/app" element={<AppPage />} />
            <Route path="/profile" element={<div data-testid="profile-page">Profile</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    setupMocks();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /chats/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    await waitFor(() => {
      expect(screen.getByTestId("profile-page")).toHaveTextContent(/profile/i);
    });
  });

  it("New chat opens search modal", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/search by name or username/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
    });
  });

  it("search with empty term clears results", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText(/no results yet/i)).toBeInTheDocument();
    });
  });

  it("search with term calls API and displays results", async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: {
        contacts: [{ _id: "c3", firstName: "Dave", lastName: "D", username: "dave" }],
      },
    });

    renderAppPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/start typing to search/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/start typing to search/i), "dave");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/api/contacts/search", {
        searchTerm: "dave",
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /dave/i })).toBeInTheDocument();
    });
  });

  it("search error shows message", async () => {
    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/contacts/search") {
        return Promise.reject({ response: { data: { message: "Search failed" } } });
      }
      return Promise.resolve({ data: { messages: [] } });
    });

    renderAppPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/start typing to search/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/start typing to search/i), "x");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not search|search failed/i);
    });
  });

  it("selecting contact from search adds to list and closes modal", async () => {
    (apiClient.post as jest.Mock).mockImplementation((url: string, body?: { searchTerm?: string }) => {
      if (url === "/api/contacts/search" && body?.searchTerm) {
        return Promise.resolve({
          data: {
            contacts: [{ _id: "c3", firstName: "Dave", lastName: "D", username: "dave" }],
          },
        });
      }
      return Promise.resolve({ data: { messages: [] } });
    });

    renderAppPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/start typing to search/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/start typing to search/i), "dave");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /dave/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /dave/i }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/start typing to search/i)).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /dave/i })).toBeInTheDocument();
  });

  it("Close button closes search modal", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/search by name or username/i)).not.toBeInTheDocument();
    });
  });

  it("receiveMessage accepts payload with message wrapper", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/bob/i));

    await waitFor(() => {
      expect(receiveMessageHandler).not.toBeNull();
    });

    act(() => {
      receiveMessageHandler!({
        message: {
          sender: { _id: "c1" },
          recipient: { _id: currentUserId },
          content: "Wrapped message",
          id: "msg-w",
          timestamp: Date.now(),
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Wrapped message")).toBeInTheDocument();
    });
  });

  it("shows message too long error when over 1000 characters", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/bob/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const longMessage = "x".repeat(1001);
    const input = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(input, longMessage);
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/message is too long|under 1000 characters/i)).toBeInTheDocument();
    });
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it("load messages error shows error message", async () => {
    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/messages/get-messages") {
        return Promise.reject({ response: { data: { message: "Failed to load messages" } } });
      }
      return Promise.resolve({ data: { messages: [] } });
    });

    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/bob/i));

    await waitFor(() => {
      expect(screen.getByText(/failed to load messages|could not load/i)).toBeInTheDocument();
    });
  });

  it("delete conversation when confirmed removes conversation and shows success", async () => {
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);
    (apiClient.delete as jest.Mock).mockResolvedValue({});

    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/bob/i));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete conversation/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /delete conversation/i }));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith("/api/contacts/delete-dm/c1");
    });
    await waitFor(() => {
      expect(screen.getByText(/conversation deleted/i)).toBeInTheDocument();
    });

    window.confirm = originalConfirm;
  });

  it("delete conversation when cancelled does not call delete API", async () => {
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => false);

    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/bob/i));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete conversation/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /delete conversation/i }));

    expect(apiClient.delete).not.toHaveBeenCalled();

    window.confirm = originalConfirm;
  });

  it("delete conversation API error shows error message", async () => {
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);
    (apiClient.delete as jest.Mock).mockRejectedValue({
      response: { data: { message: "Cannot delete" } },
    });

    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/bob/i));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete conversation/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /delete conversation/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not delete|cannot delete/i)).toBeInTheDocument();
    });

    window.confirm = originalConfirm;
  });

  it("socket connect_error handler runs without throwing", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(connectErrorHandler).not.toBeNull();
    });

    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    act(() => {
      connectErrorHandler!({ message: "xhr poll error" });
    });
    expect(consoleSpy).toHaveBeenCalledWith("[chat] socket connect_error", "xhr poll error");
    consoleSpy.mockRestore();
  });

  it("socket disconnect handler runs without throwing", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(disconnectHandler).not.toBeNull();
    });

    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    act(() => {
      disconnectHandler!("io server disconnect");
    });
    expect(consoleSpy).toHaveBeenCalledWith("[chat] socket disconnect", "io server disconnect");
    consoleSpy.mockRestore();
  });

  it("get-messages with data.messages shape parses correctly", async () => {
    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/messages/get-messages") {
        return Promise.resolve({
          data: {
            data: {
              messages: [
                {
                  _id: "m1",
                  sender: "c1",
                  recipient: currentUserId,
                  content: "From data.messages",
                  timestamp: Date.now(),
                },
              ],
            },
          },
        });
      }
      return Promise.resolve({ data: { messages: [] } });
    });

    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/bob/i));

    await waitFor(() => {
      expect(screen.getByText("From data.messages")).toBeInTheDocument();
    });
  });

  it("delete conversation does nothing when contact has no id", async () => {
    setupMocks({
      contactsList: [
        { _id: "", firstName: "Ghost", lastName: "X", username: "ghost" },
        ...contacts,
      ],
    });
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);

    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/ghost/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/ghost/i));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete conversation/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /delete conversation/i }));

    expect(apiClient.delete).not.toHaveBeenCalled();
    window.confirm = originalConfirm;
  });

  it("receiveMessage from self (echo) does not duplicate message", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/bob/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/bob/i));
    await waitFor(() => {
      expect(receiveMessageHandler).not.toBeNull();
    });

    act(() => {
      receiveMessageHandler!({
        sender: { _id: currentUserId },
        recipient: { _id: "c1" },
        content: "Echo from me",
        _id: "echo-1",
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      const echoes = screen.queryAllByText("Echo from me");
      expect(echoes.length).toBeLessThanOrEqual(1);
    });
  });
});
