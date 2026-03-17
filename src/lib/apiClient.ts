import axios, { type AxiosError } from "axios";

/** Same-origin so Vite proxy forwards to backend; cookie is set for localhost and sent on proxied requests. */
const apiClient = axios.create({
  baseURL: "",
  withCredentials: true,
  headers: {
    "ngrok-skip-browser-warning": "true",
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url ?? "";

    if (status === 401 || status === 403) {
      const isAuthEndpoint =
        url.includes("/logout") ||
        url.includes("/login") ||
        url.includes("/signup");

      if (!isAuthEndpoint) {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
