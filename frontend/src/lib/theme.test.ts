import { describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  parseChoice,
  readStoredChoice,
  resolveTheme,
  storeChoice,
  subscribeToChoice,
  THEME_STORAGE_KEY,
} from "./theme";

describe("theme", () => {
  it("treats anything but light or dark as system", () => {
    expect(parseChoice("light")).toBe("light");
    expect(parseChoice("dark")).toBe("dark");
    expect(parseChoice(null)).toBe("system");
    expect(parseChoice("purple")).toBe("system");
  });

  it("resolves system to the device preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("stores explicit choices and forgets system", () => {
    storeChoice("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(readStoredChoice()).toBe("dark");

    storeChoice("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("falls back to system when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredChoice()).toBe("system");
    spy.mockRestore();
  });

  it("notifies subscribers when the choice changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToChoice(listener);

    storeChoice("light");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    storeChoice("dark");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("applies the theme to the document and the theme-color meta tag", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);

    applyTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(meta.content).toBe("#0b0a1f");
    meta.remove();
  });
});
