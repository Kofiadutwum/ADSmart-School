import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwingIn } from "./swing-in";

afterEach(() => vi.restoreAllMocks());

describe("SwingIn", () => {
  it("never hides content that is already on screen", () => {
    render(<SwingIn><p>Visible card</p></SwingIn>);
    expect(screen.getByText("Visible card").parentElement).not.toHaveStyle({ opacity: "0" });
  });

  it("hides content below the fold until it scrolls into view", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 5000, bottom: 5200, left: 0, right: 100, width: 100, height: 200, x: 0, y: 5000, toJSON: () => ({}),
    });
    render(<SwingIn><p>Later card</p></SwingIn>);
    expect(screen.getByText("Later card").parentElement).toHaveStyle({ opacity: "0" });
  });
});
