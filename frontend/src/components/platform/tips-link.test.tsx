import { render, screen } from "@testing-library/react";
import { useSearchParams } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { TipsLink } from "./tips-link";

function withToken(token: string) {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams({ token }) as unknown as ReturnType<typeof useSearchParams>);
}

describe("TipsLink", () => {
  it("confirms a sign-up from the email link", async () => {
    withToken("abc:123");
    const fetchMock = mockApi([["POST", "/api/public/platform/tips/confirm", 200, { status: "confirmed" }]]);
    render(<TipsLink action="confirm" />);
    expect(await screen.findByRole("heading", { name: "You're signed up" })).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/public/platform/tips/confirm")).toEqual({ token: "abc:123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explains an expired or broken link", async () => {
    withToken("old");
    mockApi([["POST", "/api/public/platform/tips/unsubscribe", 400, {
      code: "invalid_link", message: "This link isn't valid.", fields: {},
    }]]);
    render(<TipsLink action="unsubscribe" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This link isn't valid.");
  });
});
