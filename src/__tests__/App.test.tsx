import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
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

describe("UnauthorizedHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { user: { id: "1", username: "alice" } },
    });
    (apiClient.post as jest.Mock).mockResolvedValue({});
  });

  it("navigates to login when auth:unauthorized is dispatched", async () => {
    renderApp("/app");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /chats/i })).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /chats/i })).not.toBeInTheDocument();
  });
});

describe("LoginPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockRejectedValue(new Error("no session"));
  });

  it("renders login form with title and fields", () => {
    renderApp("/login");

    expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^login$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign up/i })).toHaveAttribute("href", "/signup");
  });

  it("shows validation error when username is empty", async () => {
    const { container } = renderApp("/login");
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/username or email is required/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("shows validation error when password is too short", async () => {
    renderApp("/login");

    await userEvent.type(screen.getByLabelText(/username or email/i), "alice");
    await userEvent.type(screen.getByLabelText(/^password$/i), "ab");
    await userEvent.click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at least 3 characters/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("calls login and navigates on success", async () => {
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
          email: "alice",
          password: "password123",
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/chats/i)).toBeInTheDocument();
    });
  });

  it("shows validation error when username is too long", async () => {
    renderApp("/login");
    const longUsername = "a".repeat(33);
    const input = screen.getByLabelText(/username or email/i);
    fireEvent.change(input, { target: { value: longUsername } });
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at most 32 characters/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("shows validation error when password is too long", async () => {
    renderApp("/login");
    await userEvent.type(screen.getByLabelText(/username or email/i), "alice");
    const passwordInput = screen.getByLabelText(/^password$/i);
    fireEvent.change(passwordInput, { target: { value: "x".repeat(129) } });
    await userEvent.click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at most 128 characters/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

describe("SignupPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockRejectedValue(new Error("no session"));
  });

  it("renders signup form with title and fields", () => {
    renderApp("/signup");

    expect(screen.getByRole("heading", { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /login/i })).toHaveAttribute("href", "/login");
  });

  it("shows validation error when username is empty", async () => {
    const { container } = renderApp("/signup");
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/username is required/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("shows API error message from response.message on signup failure", async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({
      response: { data: { message: "Email already in use" } },
    });

    renderApp("/signup");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /create account/i })).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/^username$/i), "bob");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/email already in use/i)).toBeInTheDocument();
    });
  });

  it("shows API error from response.error on signup failure", async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({
      response: { data: { error: "Validation failed" } },
    });

    renderApp("/signup");
    await userEvent.type(screen.getByLabelText(/^username$/i), "bob");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/validation failed/i);
    });
  });

  it("shows first item from response.errors array on signup failure", async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({
      response: { data: { errors: ["Username is taken"] } },
    });

    renderApp("/signup");
    await userEvent.type(screen.getByLabelText(/^username$/i), "bob");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/username is taken/i);
    });
  });

  it("shows validation error when passwords do not match", async () => {
    renderApp("/signup");

    await userEvent.type(screen.getByLabelText(/^username$/i), "bob");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "different");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/passwords do not match/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("calls signup and navigates on success", async () => {
    (apiClient.get as jest.Mock)
      .mockRejectedValueOnce(new Error("no session"))
      .mockResolvedValue({ data: { user: { id: "1", username: "bob" } } });
    (apiClient.post as jest.Mock)
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { user: { id: "1", username: "bob" } } });

    renderApp("/signup");

    await waitFor(() => {
      expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/^username$/i), "bob");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/auth/signup",
        expect.objectContaining({
          username: "bob",
          email: "bob",
          password: "password123",
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/chats/i)).toBeInTheDocument();
    });
  });

  it("shows validation error when username is too long", async () => {
    renderApp("/signup");
    const longUsername = "a".repeat(33);
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: longUsername } });
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at most 32 characters/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("shows validation error when password is too short", async () => {
    renderApp("/signup");
    await userEvent.type(screen.getByLabelText(/^username$/i), "bob");
    await userEvent.type(screen.getByLabelText(/^password$/i), "ab");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "ab");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at least 3 characters/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("shows validation error when password is too long", async () => {
    renderApp("/signup");
    await userEvent.type(screen.getByLabelText(/^username$/i), "bob");
    const passwordInput = screen.getByLabelText(/^password$/i);
    const confirmInput = screen.getByLabelText(/confirm password/i);
    fireEvent.change(passwordInput, { target: { value: "x".repeat(129) } });
    fireEvent.change(confirmInput, { target: { value: "x".repeat(129) } });
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at most 128 characters/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
