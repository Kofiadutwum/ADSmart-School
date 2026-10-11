import { render } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { VisitBeacon } from "./visit-beacon";

describe("VisitBeacon", () => {
  it("counts a visit to the page shown, by its public address", async () => {
    vi.mocked(usePathname).mockReturnValue("/platform-site/articles");
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true });

    render(<VisitBeacon />);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, body] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("/api/public/platform/visit");
    expect(JSON.parse(await body.text())).toEqual({ path: "/articles" });
  });
});
