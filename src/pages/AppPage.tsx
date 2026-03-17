import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../lib/apiClient";
import { useAuth } from "../context/AuthContext";
import { connectSocket, disconnectSocket } from "../lib/socket";
import "../App.css";

type Contact = {
  _id: string;
  firstName: string;
  lastName: string;
  username?: string;
  email?: string;
  image?: string;
  color?: string;
  lastMessageTime?: string;
  lastMessagePreview?: string;
};

type Message = {
  _id: string;
  sender: string;
  recipient: string;
  content: string;
  timestamp?: string | number;
};

/** Parse messages from get-messages response (handles both .messages and .data.messages shapes). */
function parseGetMessagesResponse(data: unknown): Message[] {
  if (!data || typeof data !== "object") return [];
  const d = data as { messages?: Message[]; data?: { messages?: Message[] } };
  return d.messages ?? d.data?.messages ?? [];
}

const MAX_MESSAGE_LENGTH = 1000;

export default function AppPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [unreadContactIds, setUnreadContactIds] = useState<Set<string>>(() => new Set());
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selectedContactIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  selectedContactIdRef.current = selectedContactId;
  currentUserIdRef.current =
    (user as { id?: string; _id?: string })?.id ??
    (user as { id?: string; _id?: string })?._id ??
    null;

  const refreshContacts = async () => {
    try {
      const response = await apiClient.get("/api/contacts/get-contacts-for-list");
      const data = response.data as { contacts?: Contact[] };
      setContacts(data.contacts ?? []);
      setErrorMessage("");
    } catch (error) {
      const apiMessage = (
        error as { response?: { data?: { message?: string } } }
      )?.response?.data?.message;

      setErrorMessage(
        apiMessage ?? "Could not load contacts. Please try again later."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    setErrorMessage("");
    void refreshContacts();
  }, []);

  const selectedContact =
    contacts.find((contact) => contact._id === selectedContactId) ?? null;

  const handleDeleteConversation = async () => {
    if (!selectedContact) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this conversation? This will remove the DM thread from your list."
    );
    if (!confirmed) {
      return;
    }

    const dmId =
      (selectedContact as { id?: string; _id?: string }).id ??
      (selectedContact as { id?: string; _id?: string })._id;

    if (!dmId) {
      return;
    }

    setIsDeleting(true);
    setMessagesError("");
    setActionMessage("");

    try {
      await apiClient.delete(`/api/contacts/delete-dm/${dmId}`);

      setSelectedContactId(null);
      setMessages([]);
      setActionMessage("Conversation deleted.");
      await refreshContacts();
    } catch (error) {
      const apiMessage = (
        error as { response?: { data?: { message?: string } } }
      )?.response?.data?.message;

      setMessagesError(
        apiMessage ?? "Could not delete conversation. Please try again later."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        disconnectSocket();
        socketRef.current = null;
      }
      return;
    }
    const userId =
      (user as { id?: string; _id?: string })?.id ??
      (user as { id?: string; _id?: string })?._id;
    if (!userId) {
      return;
    }
    if (!socketRef.current) {
      socketRef.current = connectSocket(userId);
      const s = socketRef.current;
      s.once("connect", () => {
        // Socket connected; backend has userId from handshake query.
      });
      s.on("connect_error", (err) => {
        // eslint-disable-next-line no-console
        console.warn("[chat] socket connect_error", err.message);
      });
      s.on("disconnect", (reason) => {
        // eslint-disable-next-line no-console
        console.log("[chat] socket disconnect", reason);
      });
    }
    const socket = socketRef.current;

    // Spec §7.2: receiveMessage payload is a message object with id, sender (object), recipient (object), content, messageType, timestamp
    const handleReceiveMessage = (raw: unknown) => {
      const payload = (raw && typeof raw === "object" && "message" in (raw as object))
        ? (raw as { message: Record<string, unknown> }).message
        : raw;
      const msg = payload as {
        id?: string;
        sender?: string | { id?: string; _id?: string };
        recipient?: string | { id?: string; _id?: string };
        content?: string;
        messageType?: string;
        timestamp?: string | number;
      };
      const currentUserId = currentUserIdRef.current;
      const currentContactId = selectedContactIdRef.current;

      if (!currentUserId || !currentContactId) {
        return;
      }

      const toId = (v: unknown): string => {
        if (v == null) return "";
        if (typeof v === "string") return v;
        const o = v as { id?: string; _id?: string };
        return String(o?.id ?? o?._id ?? "");
      };
      const senderId = toId(msg.sender);
      const recipientId = toId(msg.recipient);
      const content = typeof msg.content === "string" ? msg.content : "";
      const cU = String(currentUserId);
      const cC = String(currentContactId);

      // If we're the recipient and this conversation isn't open, mark the sender (contact) as unread.
      if (currentUserId && recipientId === cU && selectedContactIdRef.current !== senderId) {
        setUnreadContactIds((prev) => new Set(prev).add(senderId));
      }

      if (!currentUserId || !currentContactId) {
        return;
      }

      const isCurrentConversation =
        (senderId === cU && recipientId === cC) ||
        (senderId === cC && recipientId === cU);

      if (!isCurrentConversation) {
        return;
      }

      // Sender already added this message optimistically; backend echoes to both, so skip to avoid duplicate.
      if (senderId === cU) {
        return;
      }

      const incomingMessage: Message = {
        _id: (msg as { id?: string; _id?: string }).id ?? (msg as { id?: string; _id?: string })._id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sender: senderId,
        recipient: recipientId,
        content,
        timestamp: msg.timestamp ?? Date.now(),
      };

      setMessages((prev) => [...prev, incomingMessage]);
    };

    socket.on("receiveMessage", handleReceiveMessage);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
    };
  }, [user]);

  useEffect(
    () => () => {
      if (socketRef.current) {
        disconnectSocket();
        socketRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedContactId) {
      setMessages([]);
      setMessagesError("");
      setIsLoadingMessages(false);
      return;
    }

    const loadMessages = async () => {
      setMessages([]);
      setIsLoadingMessages(true);
      setMessagesError("");

      try {
        const response = await apiClient.post("/api/messages/get-messages", {
          id: selectedContactId,
        });

        const messages = parseGetMessagesResponse(response.data);
        setMessages(messages);
      } catch (error) {
        const apiMessage = (
          error as { response?: { data?: { message?: string } } }
        )?.response?.data?.message;

        setMessagesError(
          apiMessage ?? "Could not load messages. Please try again later."
        );
      } finally {
        setIsLoadingMessages(false);
      }
    };

    void loadMessages();
  }, [selectedContactId]);

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <header
          className="app-sidebar-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <h1 className="app-title">Chats</h1>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="auth-button auth-button--secondary"
              style={{ marginTop: 0, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
              onClick={() => {
                navigate("/profile");
              }}
            >
              Edit profile
            </button>
            <button
              type="button"
              className="auth-button"
              style={{ marginTop: 0, padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
              onClick={async () => {
                setSelectedContactId(null);
                setContacts([]);
                setMessages([]);
                setDraftMessage("");
                setSearchTerm("");
                setSearchResults([]);
                setMessagesError("");
                setErrorMessage("");
                disconnectSocket();
                await logout();
                navigate("/login");
              }}
            >
              Logout
            </button>
          </div>
        </header>

        <div style={{ padding: "0.5rem 1.25rem 0" }}>
          <button
            type="button"
            className="auth-button"
            style={{ width: "100%", marginTop: 0 }}
            onClick={() => {
              setIsSearchOpen(true);
              setSearchError("");
              setSearchResults([]);
            }}
          >
            New chat
          </button>
        </div>

        {isLoading ? (
          <p className="app-sidebar-status">Loading contacts…</p>
        ) : errorMessage ? (
          <p className="app-sidebar-status app-sidebar-status--error">
            {errorMessage}
          </p>
        ) : contacts.length === 0 ? (
          <p className="app-sidebar-status">No contacts yet.</p>
        ) : (
          <ul className="contact-list">
            {contacts.map((contact) => {
              const isSelected = contact._id === selectedContactId;
              const fullName =
                contact.username ??
                (contact.firstName || contact.lastName
                  ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()
                  : contact.email ?? "");

              return (
                <li key={contact._id}>
                    <button
                    type="button"
                    className={`contact-list-item${
                      isSelected ? " contact-list-item--active" : ""
                    }`}
                    onClick={() => {
                      setSelectedContactId(contact._id);
                      setUnreadContactIds((prev) => {
                        const next = new Set(prev);
                        next.delete(contact._id);
                        return next;
                      });
                    }}
                  >
                    <div className="contact-initial">
                      {(contact.username?.[0] ??
                        contact.firstName?.[0] ??
                        contact.lastName?.[0] ??
                        contact.email?.[0] ??
                        "?"
                      ).toUpperCase()}
                    </div>
                    <div className="contact-meta">
                      <div className="contact-name">{fullName}</div>
                      {contact.lastMessagePreview && (
                        <div className="contact-preview">
                          {contact.lastMessagePreview}
                        </div>
                      )}
                    </div>
                    {unreadContactIds.has(contact._id) && (
                      <span className="contact-unread-dot" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {isSearchOpen && (
          <div className="search-overlay">
            <div className="search-panel">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.75rem",
                }}
              >
                <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
                  Start a new chat
                </h2>
                <button
                  type="button"
                  className="auth-button auth-button--secondary"
                  style={{
                    paddingInline: "0.6rem",
                    fontSize: "0.85rem",
                  }}
                  onClick={() => setIsSearchOpen(false)}
                >
                  Close
                </button>
              </div>

              <form
                className="auth-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setSearchError("");

                  if (!searchTerm.trim()) {
                    setSearchResults([]);
                    return;
                  }

                  setIsSearching(true);

                  try {
                    const response = await apiClient.post(
                      "/api/contacts/search",
                      {
                        searchTerm,
                      }
                    );

                    const data = response.data as { contacts?: Contact[] };
                    setSearchResults(data.contacts ?? []);
                  } catch (error) {
                    const apiMessage = (
                      error as { response?: { data?: { message?: string } } }
                    )?.response?.data?.message;

                    setSearchError(
                      apiMessage ??
                        "Could not search contacts. Please try again later."
                    );
                  } finally {
                    setIsSearching(false);
                  }
                }}
              >
                <div className="field">
                  <label htmlFor="search-term">Search by name or username</label>
                  <input
                    id="search-term"
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Start typing to search…"
                  />
                </div>

                <button
                  className="auth-button"
                  type="submit"
                  disabled={isSearching}
                >
                  {isSearching ? "Searching…" : "Search"}
                </button>
              </form>

              {searchError && (
                <p className="auth-error" role="alert">
                  {searchError}
                </p>
              )}

              <div style={{ marginTop: "0.75rem" }}>
                {searchResults.length === 0 && !isSearching && !searchError ? (
                  <p className="chat-form-hint" style={{ marginTop: 0 }}>
                    No results yet. Try searching for a contact.
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                      maxHeight: "220px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    {searchResults.map((contact) => {
                      const fullName =
                        contact.username ??
                        (contact.firstName || contact.lastName
                          ? `${contact.firstName ?? ""} ${
                              contact.lastName ?? ""
                            }`.trim()
                          : contact.email ?? "");

                      return (
                        <li key={contact._id}>
                          <button
                            type="button"
                            className="contact-list-item"
                            onClick={() => {
                              setContacts((prev) => {
                                const exists = prev.some(
                                  (c) => c._id === contact._id
                                );
                                return exists ? prev : [contact, ...prev];
                              });
                              setSelectedContactId(contact._id);
                              setIsSearchOpen(false);
                            }}
                          >
                            <div className="contact-initial">
                              {(contact.username?.[0] ??
                                contact.firstName?.[0] ??
                                contact.lastName?.[0] ??
                                contact.email?.[0] ??
                                "?"
                              ).toUpperCase()}
                            </div>
                            <div className="contact-meta">
                              <div className="contact-name">{fullName}</div>
                              <div className="contact-preview">
                                {contact.username ?? contact.email ?? ""}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>

      <section className="app-main">
        {actionMessage && (
          <p className="chat-success-banner cyber-success-box" role="status">
            {actionMessage}
          </p>
        )}
        {selectedContact ? (
          <div className="chat-placeholder">
            <header
              className="chat-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 className="chat-title">
                  {selectedContact.username ??
                    (selectedContact.firstName || selectedContact.lastName
                      ? `${selectedContact.firstName ?? ""} ${
                          selectedContact.lastName ?? ""
                        }`.trim()
                      : selectedContact.email ?? "")}
                </h2>
                <p className="chat-subtitle">Direct messages</p>
              </div>
              <button
                type="button"
                className="auth-button auth-button--danger"
                style={{ marginTop: 0, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                onClick={() => {
                  void handleDeleteConversation();
                }}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete conversation"}
              </button>
            </header>
            <div className="chat-body">
              {isLoadingMessages ? (
                <p>Loading messages…</p>
              ) : messagesError ? (
                <p className="chat-error">{messagesError}</p>
              ) : messages.length === 0 ? (
                <p>No messages yet. Start the conversation when messaging is ready.</p>
              ) : (
                <ul className="chat-message-list">
                  {messages.map((message) => {
                    const currentUserId =
                      (user as { id?: string; _id?: string })?.id ??
                      (user as { id?: string; _id?: string })?._id;
                    const isMine = currentUserId && message.sender === currentUserId;

                    return (
                      <li
                        key={message._id}
                        className={isMine ? "chat-message-item chat-message-item--mine" : "chat-message-item chat-message-item--theirs"}
                      >
                        <div
                          className={
                            isMine
                              ? "chat-message-bubble chat-message-bubble--mine"
                              : "chat-message-bubble chat-message-bubble--theirs"
                          }
                        >
                          <div className="chat-message-content">
                            {message.content}
                          </div>
                          <div
                            className={
                              isMine
                                ? "chat-message-time chat-message-time--mine"
                                : "chat-message-time chat-message-time--theirs"
                            }
                          >
                            {message.timestamp
                              ? new Date(message.timestamp).toLocaleString()
                              : ""}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </ul>
              )}

              <form
                className="chat-form"
                onSubmit={(event) => {
                  event.preventDefault();

                  if (!user || !selectedContact || !draftMessage.trim() || isSending) {
                    return;
                  }

                  const trimmedContent = draftMessage.trim();

                  if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
                    setMessagesError(
                      `Message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`
                    );
                    return;
                  }

                  const senderId =
                    (user as { id?: string; _id?: string }).id ??
                    (user as { id?: string; _id?: string })._id;
                  const recipientId =
                    (selectedContact as { id?: string; _id?: string }).id ??
                    (selectedContact as { id?: string; _id?: string })._id;

                  if (!senderId || !recipientId) {
                    return;
                  }

                  setIsSending(true);
                  setMessagesError("");

                  if (socketRef.current) {
                    socketRef.current.emit("sendMessage", {
                      sender: senderId,
                      recipient: recipientId,
                      content: trimmedContent,
                      messageType: "text",
                    });
                  }

                  const optimisticMessage: Message = {
                    _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    sender: senderId,
                    recipient: recipientId,
                    content: trimmedContent,
                    timestamp: Date.now(),
                  };

                  setMessages((previous) => [...previous, optimisticMessage]);
                  setDraftMessage("");

                  const contactId = selectedContactId;
                  if (!contactId) return;

                  apiClient
                    .post("/api/messages/get-messages", { id: contactId })
                    .then((res) => {
                      const fromServer = parseGetMessagesResponse(res.data);
                      setMessages((prev) =>
                        fromServer.length >= prev.length ? fromServer : prev
                      );
                      void refreshContacts();
                      // If backend was slow to persist, refetch after a delay so the message
                      // is there on next reload (only update if still on same conversation).
                      setTimeout(() => {
                        if (selectedContactIdRef.current !== contactId) return;
                        apiClient
                          .post("/api/messages/get-messages", { id: contactId })
                          .then((r) => {
                            const next = parseGetMessagesResponse(r.data);
                            setMessages((current) => {
                              if (selectedContactIdRef.current !== contactId) return current;
                              return next.length > current.length ? next : current;
                            });
                          })
                          .catch(() => {});
                      }, 1500);
                    })
                    .catch((err) => {
                      const apiMessage = (
                        err as { response?: { data?: { message?: string } } }
                      )?.response?.data?.message;
                      setMessagesError(
                        apiMessage ?? "Could not refresh messages. Your message may still have been sent."
                      );
                    })
                    .finally(() => {
                      setIsSending(false);
                    });
                }}
              >
                <div className="chat-form-row">
                  <input
                    type="text"
                    className="chat-form-input"
                    placeholder="Type a message…"
                    value={draftMessage}
                    onChange={(event) => setDraftMessage(event.target.value)}
                    disabled={!user || !selectedContact || isSending}
                  />
                  <button
                    type="submit"
                    className="auth-button"
                    style={{ marginTop: 0 }}
                    disabled={!user || !selectedContact || !draftMessage.trim() || isSending}
                  >
                    {isSending ? "Sending…" : "Send"}
                  </button>
                </div>
                <p className="chat-form-hint">
                  Press Enter to send.
                </p>
              </form>
            </div>
          </div>
        ) : (
          <div className="chat-placeholder chat-placeholder--empty">
            <h2>Select a contact to start chatting</h2>
            <p>
              Choose someone from the sidebar to see their conversation and send
              messages.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

