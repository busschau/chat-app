# Chat Frontend

A React + Vite chat application with authentication, real-time messaging (Socket.IO), and a cyberpunk-themed UI. This document covers code structure, tests, challenges, and extra features for handoff.

---

## Code structure

### Overview

```
src/
├── main.tsx              # Entry point
├── App.tsx                # Root: routes, LoginPage, SignupPage, UnauthorizedHandler
├── App.css                # Global layout and app-shell styles
├── index.css              # Base resets
├── setupTests.js          # Jest + Testing Library setup (e.g. jest-dom)
├── styles/
│   └── theme.css         # Cyberpunk theme (CSS variables, typography)
├── context/
│   └── AuthContext.tsx   # Auth state: user, login, logout, checkAuth; listens for auth:unauthorized
├── components/
│   └── ProtectedRoute.tsx # Wraps /app and /profile; shows loading until checkAuth, then Navigate or children
├── pages/
│   ├── AppPage.tsx       # Main chat: sidebar (contacts, New chat), conversation panel, search modal, delete conversation
│   └── ProfilePage.tsx   # Profile form (name), Back to chats, Logout
└── lib/
    ├── apiClient.ts      # Axios instance (withCredentials, ngrok header); 401/403 interceptor → auth:unauthorized
    └── socket.ts         # Socket.IO client: connectSocket(userId), disconnectSocket(); same-origin + proxy
```

### Key flows

- **Auth**: `AuthContext` provides `user`, `login`, `logout`, `checkAuth`. `ProtectedRoute` calls `checkAuth()` on mount; if no user, redirects to `/login` with `state.from: "session_expired"`. `apiClient` interceptor on 401/403 (non-auth URLs) dispatches `auth:unauthorized`; `UnauthorizedHandler` in `App` navigates to `/login` with `state.from: "unauthorized"`.
- **Routing**: `/login`, `/signup`, `/app` (ProtectedRoute → AppPage), `/profile` (ProtectedRoute → ProfilePage), `*` → `/app`.
- **Chat**: `AppPage` loads contacts via `GET /api/contacts/get-contacts-for-list`, connects socket with `connectSocket(userId)`, subscribes to `receiveMessage`. Messages for the selected conversation are loaded with `POST /api/messages/get-messages`. Send uses `socket.emit("sendMessage", …)` plus optimistic UI and a follow-up get-messages call. Logout clears state and calls `disconnectSocket()` then `logout()`.

### Tech stack

- **React 19**, **Vite 7**, **TypeScript** (via Babel in Jest)
- **React Router 7**
- **Axios** (cookie-based auth, same-origin; Vite proxy to backend)
- **Socket.IO client** (real-time messages)
- **Jest**, **jsdom**, **@testing-library/react**, **@testing-library/user-event**, **@testing-library/jest-dom**

---

## Tests performed

### Test layout

Tests live next to source in `__tests__` folders and follow the same structure:

| Location | Focus |
|----------|--------|
| `src/__tests__/App.test.tsx` | LoginPage, SignupPage, UnauthorizedHandler; validation, API errors, navigation |
| `src/__tests__/auth.behavior.test.tsx` | Full auth flows: login success/fail, logout, protected route redirect, authenticated /app access |
| `src/__tests__/system.security.test.tsx` | No /app without auth; empty/whitespace message rejection; XSS (script as text); socket disconnect on logout; protected UI not shown while auth loading |
| `src/context/__tests__/AuthContext.test.tsx` | checkAuth, login, logout, auth:unauthorized listener |
| `src/components/__tests__/ProtectedRoute.test.tsx` | Loading state, redirect when no user, children when user set, no setState after unmount |
| `src/pages/__tests__/AppPage.test.tsx` | Sidebar, empty state, load contacts on mount |
| `src/pages/__tests__/AppPage.chat.test.tsx` | Select contact, send message, receiveMessage, unread badge; contacts error; Edit profile; New chat & search (empty, with term, error, select contact, Close); message wrapper; message too long; load messages error; delete conversation (confirm/cancel/API error, no-id contact); socket connect_error/disconnect; get-messages `data.messages` shape; echo (receiveMessage from self) |
| `src/pages/__tests__/ProfilePage.test.tsx` | Profile form, validation (empty, name length), update success/error, Back to chats, Logout (disconnectSocket + navigate) |
| `src/lib/__tests__/apiClient.test.ts` | Axios instance config; interceptor success path; 401/403 → auth:unauthorized; auth endpoints and non-401/403 no dispatch; reject(error); error without config |
| `src/lib/__tests__/socket.test.ts` | connectSocket, disconnectSocket behavior |

### Running tests

```bash
npm test
npm run test:coverage
```

Coverage is reported in the terminal (text + summary) and in `coverage/` (HTML). Config in `jest.config.cjs`: coverage includes `src/**` except entry points and setup; critical areas are AuthContext, ProtectedRoute, App, AppPage, socket, ProfilePage.

### Coverage (as of project close)

- **Lines**: ~98%
- **Statements**: ~97%
- **Branches**: ~76%
- **Functions**: ~98%

Uncovered lines are mostly edge branches in `AppPage` (e.g. early returns, delayed refetch timer, scroll ref).

---

## Challenges faced

1. **Auth and API shape**  
   Aligning frontend with backend auth (cookie-based, userinfo vs login/signup response shape). Handled via a single `apiClient` and `AuthContext` with `checkAuth`/`login`/`logout` and consistent error handling and redirect state (`session_expired` / `unauthorized`).

2. **Socket lifecycle**  
   Connecting only when user is set, disconnecting on logout and on 401/403 (via `auth:unauthorized` and context clearing user). Avoiding duplicate connections and ensuring cleanup in `AppPage` (refs, effect teardown).

3. **Testing async and router**  
   Tests use `MemoryRouter` with fixed `initialEntries`, mock `apiClient` and `connectSocket`/`disconnectSocket`, and `waitFor` for async UI. Signup API-error tests were sensitive to test order (auth state from previous tests); reordering and explicit “Create account” / error assertions stabilized them.

4. **Coverage for interceptors and refs**  
   apiClient’s response interceptor was exercised by capturing the `use(onFulfilled, onRejected)` callbacks in the axios mock and invoking them. ProtectedRoute’s “don’t set state after unmount” branch was covered by resolving `checkAuth` after unmount. Some AppPage branches (e.g. `scrollIntoView`, delayed refetch) were left uncovered to avoid brittle or heavy test setup.

5. **E2E vs unit**  
   All tests are unit/integration with mocks. No Cypress/Playwright; real backend and socket are only used when running the app locally.

---

## Extra features

Beyond a minimal chat UI, the app includes:

- **Theming**  
  `src/styles/theme.css`: cyberpunk palette (neon cyan/magenta, dark backgrounds, glass panels), CSS variables, and typography (e.g. Orbitron). Used by `App.css` and components for a consistent look.

- **Profile page**  
  Update first/last name via `POST /api/auth/update-profile`, with validation and success/error messages. “Back to chats” and “Logout” (with socket disconnect).

- **New chat / contact search**  
  Modal with search input; `POST /api/contacts/search`; results can be selected to add a contact and open the conversation. Empty term clears results; errors shown.

- **Delete conversation**  
  “Delete conversation” in the chat header; confirmation dialog; `DELETE /api/contacts/delete-dm/:id`; then clear selection, refresh contacts, show success message. Handles missing contact id and API errors.

- **Unread indicators**  
  When a `receiveMessage` arrives for a conversation that isn’t currently selected, that contact is marked unread (dot). Opening the conversation clears the indicator.

- **Message validation**  
  Send disabled for empty/whitespace-only input; message length capped (e.g. 1000 chars) with user-visible error.

- **Optimistic messaging**  
  Sent messages appear immediately; get-messages is called after send to reconcile with server; optional delayed refetch for slow persistence.

- **Responsive / accessibility**  
  Semantic HTML, ARIA where relevant (e.g. loading status, alerts), keyboard-friendly forms. Layout and theme scale for different viewports.

---

## Quick start

```bash
npm install
npm run dev
```

App runs with HTTPS (and optional proxy) per `vite.config.js`. Point proxy targets to your backend/ngrok URL as needed. Tests require no backend: `npm test` and `npm run test:coverage`.
