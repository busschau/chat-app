import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "../ProtectedRoute";
import { AuthProvider } from "../../context/AuthContext";
import apiClient from "../../lib/apiClient";

jest.mock("../../lib/apiClient", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

function renderProtectedRoute(initialEntry = "/app") {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state while checking auth", () => {
    (apiClient.get as jest.Mock).mockImplementation(() => new Promise(() => {}));

    renderProtectedRoute();

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("redirects to login when user is null", async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error("Unauthorized"));

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByText("Login page")).toBeInTheDocument();
    });
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders children when user is set", async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { user: { id: "1", username: "test" } },
    });

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByText("Protected content")).toBeInTheDocument();
    });
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("does not set state after unmount when checkAuth resolves late", async () => {
    let resolveCheckAuth: (value: unknown) => void;
    const checkAuthPromise = new Promise((resolve) => {
      resolveCheckAuth = resolve;
    });
    (apiClient.get as jest.Mock).mockReturnValue(checkAuthPromise);

    const { unmount } = renderProtectedRoute();
    expect(screen.getByRole("status")).toBeInTheDocument();

    unmount();
    resolveCheckAuth!({ data: { user: { id: "1", username: "test" } } });
    await checkAuthPromise;

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});
