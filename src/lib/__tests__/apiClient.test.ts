jest.mock("axios", () => {
  let responseUseCallbacks: { onFulfilled?: (r: unknown) => unknown; onRejected?: (e: unknown) => unknown } = {};
  const mockInstance = {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      response: {
        use: jest.fn((onFulfilled: (r: unknown) => unknown, onRejected: (e: unknown) => unknown) => {
          responseUseCallbacks = { onFulfilled, onRejected };
        }),
      },
    },
  };
  const create = jest.fn(() => mockInstance);
  create.getResponseUseCallbacks = () => responseUseCallbacks;
  return { create };
});

import axios from "axios";
import apiClient from "../apiClient";

const getInterceptorErrorHandler = () => (axios.create as jest.Mock).getResponseUseCallbacks?.().onRejected;
const getInterceptorSuccessHandler = () => (axios.create as jest.Mock).getResponseUseCallbacks?.().onFulfilled;

describe("apiClient", () => {
  it("creates axios instance with baseURL, withCredentials, and ngrok header", () => {
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: "",
      withCredentials: true,
      headers: {
        "ngrok-skip-browser-warning": "true",
      },
    });
  });

  it("exposes get, post methods", () => {
    expect(apiClient).toBeDefined();
    expect(typeof apiClient.get).toBe("function");
    expect(typeof apiClient.post).toBe("function");
  });

  describe("response interceptor", () => {
    it("success handler returns the response unchanged", () => {
      const successHandler = getInterceptorSuccessHandler();
      expect(successHandler).toBeDefined();
      const response = { data: { foo: 1 } };
      expect(successHandler!(response)).toBe(response);
    });

    it("dispatches auth:unauthorized on 401 for non-auth URLs", async () => {
      const errorHandler = getInterceptorErrorHandler();
      expect(errorHandler).toBeDefined();
      const dispatchSpy = jest.spyOn(window, "dispatchEvent");
      await errorHandler({ response: { status: 401 }, config: { url: "/api/contacts" } }).catch(
        () => {}
      );
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "auth:unauthorized" })
      );
      dispatchSpy.mockRestore();
    });

    it("dispatches auth:unauthorized on 403 for non-auth URLs", async () => {
      const errorHandler = getInterceptorErrorHandler();
      const dispatchSpy = jest.spyOn(window, "dispatchEvent");
      await errorHandler({ response: { status: 403 }, config: { url: "/api/something" } }).catch(
        () => {}
      );
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "auth:unauthorized" })
      );
      dispatchSpy.mockRestore();
    });

    it("does not dispatch for auth endpoints on 401", async () => {
      const errorHandler = getInterceptorErrorHandler();
      const dispatchSpy = jest.spyOn(window, "dispatchEvent");
      await errorHandler({
        response: { status: 401 },
        config: { url: "/api/auth/login" },
      }).catch(() => {});
      await errorHandler({
        response: { status: 401 },
        config: { url: "/api/auth/signup" },
      }).catch(() => {});
      await errorHandler({
        response: { status: 401 },
        config: { url: "/api/auth/logout" },
      }).catch(() => {});
      expect(dispatchSpy).not.toHaveBeenCalled();
      dispatchSpy.mockRestore();
    });

    it("does not dispatch when status is not 401 or 403", async () => {
      const errorHandler = getInterceptorErrorHandler();
      const dispatchSpy = jest.spyOn(window, "dispatchEvent");
      await errorHandler({ response: { status: 500 }, config: { url: "/api/contacts" } }).catch(
        () => {}
      );
      expect(dispatchSpy).not.toHaveBeenCalled();
      dispatchSpy.mockRestore();
    });

    it("rejects with the error", async () => {
      const errorHandler = getInterceptorErrorHandler();
      const err = { response: { status: 401 }, config: { url: "/api/foo" } };
      await expect(errorHandler(err)).rejects.toBe(err);
    });

    it("handles error without config (url defaults to empty string)", async () => {
      const errorHandler = getInterceptorErrorHandler();
      const dispatchSpy = jest.spyOn(window, "dispatchEvent");
      await errorHandler({ response: { status: 401 } }).catch(() => {});
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "auth:unauthorized" })
      );
      dispatchSpy.mockRestore();
    });
  });
});
