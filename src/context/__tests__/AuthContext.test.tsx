import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "../AuthContext";
import apiClient from "../../lib/apiClient";

jest.mock("../../lib/apiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

function TestConsumer() {
  const { user, login, logout, checkAuth } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.username : "none"}</span>
      <button type="button" onClick={() => login("u", "p")}>
        Login
      </button>
      <button type="button" onClick={() => logout()}>
        Logout
      </button>
      <button type="button" onClick={() => checkAuth()}>
        Check
      </button>
    </div>
  );
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useAuth", () => {
    it("throws when used outside AuthProvider", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      expect(() => render(<TestConsumer />)).toThrow(
        "useAuth must be used within an AuthProvider"
      );
      consoleSpy.mockRestore();
    });
  });

  describe("checkAuth", () => {
    it("sets user when userinfo returns data", async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { user: { id: "1", username: "jane" } },
      });

      renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("jane");
      });
    });

    it("sets user to null when userinfo fails", async () => {
      apiClient.get.mockRejectedValueOnce(new Error("Unauthorized"));

      renderWithAuth();

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith("/api/auth/userinfo");
      });

      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });
  });

  describe("login", () => {
    it("calls api and updates user on success", async () => {
      apiClient.get.mockRejectedValue(new Error("no session"));
      apiClient.post.mockResolvedValueOnce({
        data: { user: { id: "1", username: "alice" } },
      });

      renderWithAuth();
      await waitFor(() => expect(apiClient.get).toHaveBeenCalled());

      const loginBtn = screen.getByRole("button", { name: /login/i });
      await userEvent.click(loginBtn);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith("/api/auth/login", expect.any(Object));
        expect(screen.getByTestId("user")).toHaveTextContent("alice");
      });
    });
  });

  describe("logout", () => {
    it("calls api and clears user", async () => {
      apiClient.get.mockResolvedValueOnce({
        data: { user: { id: "1", username: "bob" } },
      });
      apiClient.post.mockResolvedValueOnce({});

      renderWithAuth();
      await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("bob"));

      const logoutBtn = screen.getByRole("button", { name: /logout/i });
      await userEvent.click(logoutBtn);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith("/api/auth/logout");
        expect(screen.getByTestId("user")).toHaveTextContent("none");
      });
    });
  });
});
