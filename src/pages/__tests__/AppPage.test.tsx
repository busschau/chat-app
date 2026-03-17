import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

const mockIo = jest.fn(() => ({
  connected: false,
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
}));

jest.mock("../../lib/socket", () => ({
  connectSocket: jest.fn((userId: string) => mockIo(userId)),
  disconnectSocket: jest.fn(),
}));

const mockUser = { id: "user-1", username: "alice", firstName: "Alice", lastName: "A" };

function renderAppPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/app"]}>
        <AppPage />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("AppPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({
        data: { id: "user-1", username: "alice", firstName: "Alice", lastName: "A" },
      })
      .mockResolvedValue({
        data: { contacts: [] },
      });
  });

  it("renders sidebar with Chats title and New chat button", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /chats/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  });

  it("shows empty state when no contact is selected", async () => {
    renderAppPage();

    await waitFor(() => {
      expect(screen.getByText(/select a contact to start chatting/i)).toBeInTheDocument();
    });
  });

  it("loads contacts on mount", async () => {
    const contacts = [
      {
        _id: "c1",
        firstName: "Bob",
        lastName: "B",
        username: "bob",
      },
    ];
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({
        data: { id: "user-1", username: "alice", firstName: "Alice", lastName: "A" },
      })
      .mockResolvedValue({ data: { contacts } });

    renderAppPage();

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith("/api/contacts/get-contacts-for-list");
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith("/api/contacts/get-contacts-for-list");
    });
  });
});
