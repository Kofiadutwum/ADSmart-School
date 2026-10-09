import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, todayInAccra } from "./dates";

describe("dates", () => {
  it("formats a moment with its time in Accra", () => {
    expect(formatDateTime("2026-10-09T14:05:00Z")).toBe("9 Oct 2026, 14:05");
  });

  it("formats dates the British way in Accra time", () => {
    expect(formatDate("2026-10-09T08:00:00+00:00")).toBe("9 October 2026");
    expect(formatDate("2026-01-01")).toBe("1 January 2026");
  });

  it("gives today's date in Accra as YYYY-MM-DD", () => {
    expect(todayInAccra(new Date("2026-10-09T23:30:00Z"))).toBe("2026-10-09");
  });
});
