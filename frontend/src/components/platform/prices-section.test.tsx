import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricesSection, cedis } from "./prices-section";

const PRICES = {
  plans: [
    { name: "Basic", audience: "Small schools", yearly_price: 120_000, from_price: false, includes: ["Website", "Portal"] },
    { name: "Enterprise", audience: "School groups", yearly_price: 1_000_000, from_price: true, includes: [] },
  ],
  setup_fee: 100_000,
};

describe("PricesSection", () => {
  it("shows each plan's yearly price, From for agreed prices, and the setup fee", () => {
    render(<PricesSection prices={PRICES} />);
    const basic = screen.getByRole("article", { name: "Basic" });
    expect(within(basic).getByText("GH₵1,200")).toBeInTheDocument();
    expect(within(basic).getByRole("link", { name: "Get started" })).toHaveAttribute("href", "#get-online");
    const enterprise = screen.getByRole("article", { name: "Enterprise" });
    expect(within(enterprise).getByText("From")).toBeInTheDocument();
    expect(within(enterprise).getByRole("link", { name: "Talk to us" })).toBeInTheDocument();
    expect(screen.getByText("GH₵1,000")).toBeInTheDocument();
  });

  it("stays hidden when there are no plans to show, and leaves out a zero setup fee", () => {
    const { container } = render(<PricesSection prices={{ plans: [], setup_fee: 100_000 }} />);
    expect(container).toBeEmptyDOMElement();
    render(<PricesSection prices={{ ...PRICES, setup_fee: 0 }} />);
    expect(screen.queryByText(/setup fee/)).not.toBeInTheDocument();
  });

  it("writes whole cedis", () => {
    expect(cedis(720_000)).toBe("GH₵7,200");
  });
});
