/**
 * Jest tests for authentication behavior.
 * Covers: successful login, failed login, logout, ProtectedRoute redirect, authenticated access.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { AuthProvider } from "../context/AuthContext";
import apiClient from "../lib/apiClient";

jest.mock("../lib/apiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

function renderApp(initialEntry = "/login") {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("Authentication behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("successful login", () => {
    it("stores user and navigates to /app", async () => {
      (apiClient.get as jest.Mock)
        .mockRejectedValueOnce(new Error("no session"))
        .mockResolvedValue({ data: { user: { id: "1", username: "alice" } } });
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { user: { id: "1", username: "alice" } },
      });

      renderApp("/login");

      await userEvent.type(screen.getByLabelText(/username or email/i), "alice");
      await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
      await userEvent.click(screen.getByRole("button", { name: /^login$/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          "/api/auth/login",
          expect.objectContaining({
            username: "alice",
            password: "password123",
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /chats/i })).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    });
  });

  describe("failed login", () => {
    it("shows error message and stays on login page", async () => {
      (apiClient.get as jest.Mock).mockRejectedValue(new Error("no session"));
      (apiClient.post as jest.Mock).mockRejectedValue({
        response: { data: { message: "Invalid credentials" } },
      });

      renderApp("/login");

      await userEvent.type(screen.getByLabelText(/username or email/i), "alice");
      await userEvent.type(screen.getByLabelText(/^password$/i), "wrongpassword");
      await userEvent.click(screen.getByRole("button", { name: /^login$/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(/invalid credentials/i);
      });
      expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
      expect(apiClient.post).toHaveBeenCalledWith("/api/auth/login", expect.any(Object));
    });

    it("shows generic error when API does not return message", async () => {
      (apiClient.get as jest.Mock).mockRejectedValue(new Error("no session"));
      (apiClient.post as jest.Mock).mockRejectedValue(new Error("Network error"));

      renderApp("/login");

      await userEvent.type(screen.getByLabelText(/username or email/i), "alice");
      await userEvent.type(screen.getByLabelText(/^password$/i), "pass");
      await userEvent.click(screen.getByRole("button", { name: /^login$/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(/login failed/i);
      });
    });
  });

  describe("logout", () => {
    it("clears auth state and redirects to /login", async () => {
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
        expect(apiClient.post).toHaveBeenCalledWith("/api/auth/logout");
      });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
    });
  });

  describe("ProtectedRoute", () => {
    it("redirects unauthenticated users to /login", async () => {
      (apiClient.get as jest.Mock).mockRejectedValue(new Error("Unauthorized"));

      renderApp("/app");

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole("heading", { name: /chats/i })).not.toBeInTheDocument();
    });

    it("allows authenticated users to access protected routes", async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: { user: { id: "1", username: "alice" } },
      });

      renderApp("/app");

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /chats/i })).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
      expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
    });
  });
});
