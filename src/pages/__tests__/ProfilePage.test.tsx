import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProfilePage from "../ProfilePage";
import { AuthProvider } from "../../context/AuthContext";
import apiClient from "../../lib/apiClient";
import * as socketModule from "../../lib/socket";

jest.mock("../../lib/apiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("../../lib/socket", () => ({
  disconnectSocket: jest.fn(),
}));

const mockUser = {
  id: "1",
  username: "jane",
  firstName: "Jane",
  lastName: "Doe",
};

function renderProfilePage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/profile"]}>
        <ProfilePage />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { user: mockUser },
    });
  });

  it("user can open the profile page", async () => {
    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /profile/i })).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("renders profile form and user name fields", async () => {
    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /profile/i })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Jane");
      expect(screen.getByLabelText(/last name/i)).toHaveValue("Doe");
    });

    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to chats/i })).toBeInTheDocument();
  });

  it("entering first name and last name sends request to /api/auth/update-profile", async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: {} });
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: { user: mockUser } })
      .mockResolvedValue({ data: { user: mockUser } });

    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Jane");
    });

    await userEvent.clear(screen.getByLabelText(/first name/i));
    await userEvent.type(screen.getByLabelText(/first name/i), "Janet");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/api/auth/update-profile", {
        firstName: "Janet",
        lastName: "Doe",
      });
    });
  });

  it("shows validation error when first or last name is empty", async () => {
    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Jane");
    });

    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    await userEvent.clear(firstNameInput);
    await userEvent.clear(lastNameInput);

    fireEvent.submit(screen.getByRole("button", { name: /save changes/i }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/first and last name are required/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("shows validation error when name exceeds max length", async () => {
    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Jane");
    });

    const longName = "a".repeat(51);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: longName } });
    fireEvent.submit(screen.getByRole("button", { name: /save changes/i }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at most 50 characters/i);
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("calls update-profile and shows success on save", async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: {} });
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: { user: mockUser } })
      .mockResolvedValueOnce({
        data: { user: { ...mockUser, firstName: "Janet", lastName: "Doe" } },
      });

    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Jane");
    });

    await userEvent.clear(screen.getByLabelText(/first name/i));
    await userEvent.type(screen.getByLabelText(/first name/i), "Janet");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/api/auth/update-profile", {
        firstName: "Janet",
        lastName: "Doe",
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/profile updated successfully/i);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Janet");
      expect(screen.getByLabelText(/last name/i)).toHaveValue("Doe");
    });
  });

  it("error responses display a user-friendly message", async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({
      response: { data: { message: "Username already taken" } },
    });

    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Jane");
    });

    await userEvent.clear(screen.getByLabelText(/first name/i));
    await userEvent.type(screen.getByLabelText(/first name/i), "Janet");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/username already taken/i);
    });
    expect(apiClient.post).toHaveBeenCalledWith("/api/auth/update-profile", {
      firstName: "Janet",
      lastName: "Doe",
    });
  });

  it("displays fallback error message when API returns no message", async () => {
    (apiClient.post as jest.Mock).mockRejectedValue(new Error("Network error"));

    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Jane");
    });

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not update profile/i);
    });
  });

  it("Back to chats navigates to /app", async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/profile"]}>
          <Routes>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/app" element={<div data-testid="app-page">Chats</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /profile/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /back to chats/i }));

    await waitFor(() => {
      expect(screen.getByTestId("app-page")).toHaveTextContent(/chats/i);
    });
  });

  it("Logout calls disconnectSocket and navigates to login", async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({});

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/profile"]}>
          <Routes>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /profile/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /logout/i }));

    await waitFor(() => {
      expect(socketModule.disconnectSocket).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });
});
