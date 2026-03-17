import React, { FormEvent, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import apiClient from "./lib/apiClient";
import "./App.css";
import AppPage from "./pages/AppPage";
import ProfilePage from "./pages/ProfilePage";

const USERNAME_MAX_LENGTH = 32;
const PASSWORD_MIN_LENGTH = 3;
const PASSWORD_MAX_LENGTH = 128;

function UnauthorizedHandler() {
  const navigate = useNavigate();
  React.useEffect(() => {
    const handler = () => {
      navigate("/login", { replace: true, state: { from: "unauthorized" } });
    };
    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
  }, [navigate]);
  return null;
}

function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/app" replace />;
  }

  const sessionExpired = (location.state as { from?: string } | null)?.from === "session_expired";
  const unauthorized = (location.state as { from?: string } | null)?.from === "unauthorized";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const trimmedUsername = username.trim();
    const trimmedPassword = password;

    if (!trimmedUsername) {
      setErrorMessage("Username or email is required.");
      return;
    }

    if (trimmedUsername.length > USERNAME_MAX_LENGTH) {
      setErrorMessage(`Username or email must be at most ${USERNAME_MAX_LENGTH} characters.`);
      return;
    }

    if (trimmedPassword.length < PASSWORD_MIN_LENGTH) {
      setErrorMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
      return;
    }

    if (trimmedPassword.length > PASSWORD_MAX_LENGTH) {
      setErrorMessage(`Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`);
      return;
    }

    setIsSubmitting(true);

    try {
      await login(trimmedUsername, trimmedPassword);
      navigate("/app");
    } catch (error) {
      const apiMessage = (
        error as { response?: { data?: { message?: string } } }
      )?.response?.data?.message;

      setErrorMessage(apiMessage ?? "Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Log in to continue to your messages.</p>

        {sessionExpired && (
          <p className="auth-error" role="alert" style={{ marginBottom: "0.5rem" }}>
            Your session expired. Please log in again.
          </p>
        )}

        {unauthorized && (
          <p className="auth-error" role="alert" style={{ marginBottom: "0.5rem" }}>
            Unauthorized. Please log in to continue.
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username or email</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username or email"
              maxLength={USERNAME_MAX_LENGTH}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={PASSWORD_MAX_LENGTH}
              required
            />
          </div>

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Logging in..." : "Login"}
          </button>
        </form>

        {errorMessage && (
          <p className="auth-error" role="alert">
            {errorMessage}
          </p>
        )}

        <p className="auth-footer">
          Need an account? <Link to="/signup">Sign up</Link>
        </p>
      </section>
    </main>
  );
}

function SignupPage() {
  const { user, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/app" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const trimmedUsername = username.trim();
    const trimmedPassword = password;
    const trimmedConfirm = confirmPassword;

    if (!trimmedUsername) {
      setErrorMessage("Username is required.");
      return;
    }

    if (trimmedUsername.length > USERNAME_MAX_LENGTH) {
      setErrorMessage(`Username must be at most ${USERNAME_MAX_LENGTH} characters.`);
      return;
    }

    if (trimmedPassword.length < PASSWORD_MIN_LENGTH) {
      setErrorMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
      return;
    }

    if (trimmedPassword.length > PASSWORD_MAX_LENGTH) {
      setErrorMessage(`Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`);
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await apiClient.post("/api/auth/signup", {
        username: trimmedUsername,
        email: trimmedUsername,
        password: trimmedPassword,
      });
      await checkAuth();
      navigate("/app");
    } catch (error) {
      const res = (error as { response?: { data?: Record<string, unknown> } })
        ?.response?.data;
      const apiMessage =
        typeof res?.message === "string"
          ? res.message
          : typeof res?.error === "string"
            ? res.error
            : res && Array.isArray(res.errors) && res.errors[0] !== undefined
              ? String((res.errors as unknown[])[0])
              : undefined;

      setErrorMessage(apiMessage ?? "Signup failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">Sign up to get started.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="signup-username">Username</label>
            <input
              id="signup-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              maxLength={USERNAME_MAX_LENGTH}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={PASSWORD_MAX_LENGTH}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              maxLength={PASSWORD_MAX_LENGTH}
              required
            />
          </div>

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Sign up"}
          </button>
        </form>

        {errorMessage && (
          <p className="auth-error" role="alert">
            {errorMessage}
          </p>
        )}

        <p className="auth-footer">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <>
      <UnauthorizedHandler />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
    </>
  );
}
