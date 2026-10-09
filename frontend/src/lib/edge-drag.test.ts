import { describe, expect, it } from "vitest";
import { edgeSafeDrag } from "./edge-drag";

describe("edgeSafeDrag", () => {
  it("ignores drags that start within 24px of either screen edge", () => {
    expect(edgeSafeDrag(null, new MouseEvent("pointerdown", { clientX: 10 }))).toBe(false);
    expect(edgeSafeDrag(null, new MouseEvent("pointerdown", { clientX: window.innerWidth - 10 }))).toBe(false);
  });

  it("allows drags that start elsewhere", () => {
    expect(edgeSafeDrag(null, new MouseEvent("pointerdown", { clientX: 200 }))).toBe(true);
  });
});
