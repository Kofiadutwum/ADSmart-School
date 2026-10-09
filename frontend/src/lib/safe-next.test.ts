import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/account?tab=security")).toBe("/account?tab=security");
  });

  it("refuses anything that could leave the site", () => {
    for (const next of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "account"]) {
      expect(safeNext(next)).toBe("/account");
    }
  });
});
