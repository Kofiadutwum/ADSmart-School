import { describe, expect, it } from "vitest";
import { ghs, toCedis, toPesewas } from "./money";

describe("money", () => {
  it("shows pesewas as cedis", () => {
    expect(ghs(150_000)).toBe("GH₵1,500.00");
    expect(ghs(5)).toBe("GH₵0.05");
    expect(ghs(null)).toBe("GH₵0.00");
  });

  it("reads what people type as pesewas, and refuses anything else", () => {
    expect(toPesewas("12.5")).toBe(1250);
    expect(toPesewas("1,500.00")).toBe(150_000);
    expect(toPesewas("-3")).toBe(-300);
    expect(toPesewas("12.345")).toBeNull();
    expect(toPesewas("abc")).toBeNull();
    expect(toPesewas("")).toBeNull();
  });

  it("fills an input from pesewas", () => {
    expect(toCedis(1250)).toBe("12.50");
    expect(toCedis(null)).toBe("");
  });
});
