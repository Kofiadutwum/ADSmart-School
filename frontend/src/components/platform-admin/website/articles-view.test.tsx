import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { ArticlesView } from "./articles-view";
import { DRAFT } from "./fixtures";

const URL = "/api/platform/website/articles";

describe("ArticlesView", () => {
  it("lists articles with where each one stands", async () => {
    mockApi([["GET", URL, 200, [
      DRAFT,
      { ...DRAFT, id: 6, title: "Keep parents informed", status: "published", state: "scheduled", publish_at: "2026-10-20T08:00:00Z" },
      { ...DRAFT, id: 7, title: "We are live", kind: "news", status: "published", state: "published", publish_at: "2026-10-01T08:00:00Z" },
    ]]]);
    render(<ArticlesView />);
    expect(await screen.findByRole("link", { name: "Make it easy to enquire" })).toHaveAttribute("href", "/website/articles/5");
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText(/^Scheduled for/)).toBeInTheDocument();
    expect(screen.getByText(/^Published/)).toBeInTheDocument();
  });

  it("starts a draft and opens it", async () => {
    const fetchMock = mockApi([["GET", URL, 200, []], ["POST", URL, 201, DRAFT]]);
    const user = userEvent.setup();
    render(<ArticlesView />);
    await user.type(await screen.findByLabelText(/^title/i), "Make it easy to enquire");
    await user.selectOptions(screen.getByLabelText(/^kind/i), "news");
    await user.click(screen.getByRole("button", { name: "Start writing" }));
    expect(bodyOf(fetchMock, "POST", URL)).toEqual({ kind: "news", title: "Make it easy to enquire" });
    expect(useRouter().push).toHaveBeenCalledWith("/website/articles/5");
  });
});
