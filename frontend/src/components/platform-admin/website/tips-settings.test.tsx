import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { TipsSettings } from "./tips-settings";

const COUNTS = "/api/platform/website/subscribers";
const SETTINGS = "/api/platform/website/settings";

describe("TipsSettings", () => {
  it("shows subscriber numbers and the download link", async () => {
    mockApi([
      ["GET", COUNTS, 200, { confirmed: 12, pending: 3, unsubscribed: 1 }],
      ["GET", SETTINGS, 200, { whatsapp_channel_url: "" }],
    ]);
    render(<TipsSettings />);
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download subscribers/i })).toHaveAttribute(
      "href", "/api/platform/website/subscribers.csv",
    );
  });

  it("saves the WhatsApp Channel link and shows a wrong link's error", async () => {
    const link = "https://whatsapp.com/channel/0029VaExample";
    const fetchMock = mockApi([
      ["GET", COUNTS, 200, { confirmed: 0, pending: 0, unsubscribed: 0 }],
      ["GET", SETTINGS, 200, { whatsapp_channel_url: "" }],
      ["PATCH", SETTINGS, 400, {
        code: "validation_error", message: "Please check the highlighted fields.",
        fields: { whatsapp_channel_url: ["Paste your WhatsApp Channel's link."] },
      }],
      ["PATCH", SETTINGS, 200, { whatsapp_channel_url: link }],
    ]);
    const user = userEvent.setup();
    render(<TipsSettings />);
    const field = await screen.findByLabelText(/whatsapp channel link/i);
    await user.type(field, "https://example.com");
    await user.click(screen.getByRole("button", { name: "Save link" }));
    expect(await screen.findByText("Paste your WhatsApp Channel's link.")).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, link);
    await user.click(screen.getByRole("button", { name: "Save link" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PATCH", SETTINGS)).toEqual({ whatsapp_channel_url: "https://example.com" });
  });
});
