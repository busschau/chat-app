import "@testing-library/jest-dom";

// Polyfill for react-router-dom in jsdom
if (typeof globalThis.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// jsdom does not implement scrollIntoView
if (typeof window !== "undefined" && typeof window.HTMLElement !== "undefined") {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
}
