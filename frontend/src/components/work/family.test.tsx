import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { ParentPaymentsScreen, PayLinkScreen } from "./family";

const AMA = { id: 7, first_name: "Ama", name: "Ama Mensah", class: "Basic 2" };
const MONEY = { fees_owed: 120_000, wallet: -500, online_payment: true, invoices: [], receipts: [] };

describe("parent payments", () => {
  const assign = vi.fn();
  afterEach(() => assign.mockReset());

  it("shows what is owed and sends Pay now to Paystack with the amount in pesewas", async () => {
    vi.stubGlobal("location", { ...window.location, assign });
    const fetchMock = mockApi([
      ["GET", "/api/parent/wards", 200, [AMA]],
      ["GET", "/api/parent/wards/7/money", 200, MONEY],
      ["POST", "/api/parent/pay", 200, { reference: "ADS1", authorization_url: "https://checkout.paystack.com/abc" }],
    ]);
    const user = userEvent.setup();
    render(<ParentPaymentsScreen />);
    expect(await screen.findByText("GH₵1,200.00")).toBeInTheDocument();
    expect(screen.getByText("Daily charges are owed")).toBeInTheDocument();
    const amount = screen.getByLabelText(/amount/i);
    await user.clear(amount);
    await user.type(amount, "300");
    await user.click(screen.getByRole("button", { name: "Pay now" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.paystack.com/abc"));
    expect(bodyOf(fetchMock, "POST", "/api/parent/pay")).toEqual({ student: 7, amount: 30_000, purpose: "FEES" });
  });

  it("says when online payment isn't set up", async () => {
    mockApi([
      ["GET", "/api/parent/wards", 200, [AMA]],
      ["GET", "/api/parent/wards/7/money", 200, { ...MONEY, online_payment: false }],
    ]);
    render(<ParentPaymentsScreen />);
    expect(await screen.findByText(/Online payment isn't set up yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay now" })).not.toBeInTheDocument();
  });
});

describe("payment link", () => {
  it("shows only the school, the child's first name and the amount", async () => {
    mockApi([["GET", "/api/public/pay/tok", 200, { school: "ADsmart Academy", pupil: "Ama", amount: 25_000, purpose: "FEES" }]]);
    render(<PayLinkScreen token="tok" />);
    expect(await screen.findByText("ADsmart Academy")).toBeInTheDocument();
    expect(screen.getByText(/for Ama's school fees/)).toBeInTheDocument();
    expect(screen.getByText("GH₵250.00")).toBeInTheDocument();
  });
});
