import React, { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import apiClient from "../lib/apiClient";
import { disconnectSocket } from "../lib/socket";
import "../App.css";

const NAME_MAX_LENGTH = 50;

export default function ProfilePage() {
  const { user, checkAuth, logout } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
  }, [user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (!trimmedFirstName || !trimmedLastName) {
      setErrorMessage("First and last name are required.");
      setIsSubmitting(false);
      return;
    }

    if (trimmedFirstName.length > NAME_MAX_LENGTH || trimmedLastName.length > NAME_MAX_LENGTH) {
      setErrorMessage(`Names must be at most ${NAME_MAX_LENGTH} characters.`);
      setIsSubmitting(false);
      return;
    }

    try {
      await apiClient.post("/api/auth/update-profile", {
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
      });

      await checkAuth();
      setSuccessMessage("Profile updated successfully.");
    } catch (error) {
      const apiMessage = (
        error as { response?: { data?: { message?: string } } }
      )?.response?.data?.message;

      setErrorMessage(apiMessage ?? "Could not update profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    disconnectSocket();
    await logout();
    navigate("/login");
  };

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <div>
            <h1 className="auth-title">Profile</h1>
            <p className="auth-subtitle">Update your name.</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="auth-button auth-button--secondary"
              style={{
                paddingInline: "0.9rem",
                whiteSpace: "nowrap",
              }}
              onClick={() => {
                navigate("/app");
              }}
            >
              Back to chats
            </button>
            <button
              type="button"
              className="auth-button"
              style={{ paddingInline: "0.9rem", whiteSpace: "nowrap" }}
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="first-name">First name</label>
            <input
              id="first-name"
              type="text"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              maxLength={NAME_MAX_LENGTH}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="last-name">Last name</label>
            <input
              id="last-name"
              type="text"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              maxLength={NAME_MAX_LENGTH}
              required
            />
          </div>

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save changes"}
          </button>
        </form>

        {errorMessage && (
          <p className="auth-error" role="alert">
            {errorMessage}
          </p>
        )}

        {successMessage && (
          <p
            role="status"
            className="cyber-success-box"
            style={{
              marginTop: "0.75rem",
              fontSize: "0.9rem",
              borderRadius: "10px",
              padding: "0.5rem 0.75rem",
            }}
          >
            {successMessage}
          </p>
        )}
      </section>
    </main>
  );
}

