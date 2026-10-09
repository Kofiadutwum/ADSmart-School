import { describe, expect, it, vi } from "vitest";
import { BOOT_SCRIPT, shouldUseLite } from "./boot-script";
import { THEME_STORAGE_KEY } from "./theme";

const capable = {
  forced: false,
  saveData: false,
  deviceMemory: 8,
  supportsBackdrop: true,
  prefersReducedTransparency: false,
};

describe("shouldUseLite", () => {
  it("is off on a capable device", () => {
    expect(shouldUseLite(capable)).toBe(false);
  });

  it.each([
    ["it is forced", { forced: true }],
    ["Data Saver is on", { saveData: true }],
    ["memory is low", { deviceMemory: 2 }],
    ["blur is unsupported", { supportsBackdrop: false }],
    ["reduced transparency is requested", { prefersReducedTransparency: true }],
  ])("turns on when %s", (_reason, override) => {
    expect(shouldUseLite({ ...capable, ...override })).toBe(true);
  });

  it("ignores unknown device memory", () => {
    expect(shouldUseLite({ ...capable, deviceMemory: undefined })).toBe(false);
  });
});

describe("BOOT_SCRIPT", () => {
  it("applies a stored dark choice before paint", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    new Function(BOOT_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("follows the device when nothing is stored", () => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-color-scheme: dark)",
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList,
    );

    new Function(BOOT_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("uses Lite mode when the browser cannot blur", () => {
    const supports = vi.spyOn(window.CSS, "supports").mockReturnValue(false);

    new Function(BOOT_SCRIPT)();

    expect(document.documentElement.hasAttribute("data-lite")).toBe(true);
    supports.mockRestore();
  });

  it("stays in full mode on a capable browser", () => {
    new Function(BOOT_SCRIPT)();

    expect(document.documentElement.hasAttribute("data-lite")).toBe(false);
  });
});
