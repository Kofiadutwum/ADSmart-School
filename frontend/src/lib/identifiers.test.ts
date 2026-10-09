import { describe, expect, it } from "vitest";
import { formatIdentifier, formatPhoneLocal, formatStudentId } from "./identifiers";

describe("identifiers", () => {
  it("writes Ghana numbers the local way", () => {
    expect(formatPhoneLocal("+233241234567")).toBe("024 123 4567");
    expect(formatPhoneLocal("not a number")).toBe("not a number");
  });

  it("writes Student IDs with dashes", () => {
    expect(formatStudentId("2601473")).toBe("26-0147-3");
    expect(formatStudentId("123")).toBe("123");
  });

  it("picks the right format for each kind of account", () => {
    expect(formatIdentifier({ kind: "parent", username: "+233241234567" })).toBe("024 123 4567");
    expect(formatIdentifier({ kind: "student", username: "2601473" })).toBe("26-0147-3");
    expect(formatIdentifier({ kind: "staff", username: "k.mensah" })).toBe("k.mensah");
    expect(formatIdentifier({ kind: "platform", username: "ops" })).toBe("ops");
  });
});
