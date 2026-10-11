import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { ArticleEditor } from "./article-editor";
import { DRAFT } from "./fixtures";

const URL = "/api/platform/website/articles/5";
const READY = { ...DRAFT, summary: "Small changes that help.", body: "## Answer quickly\n\nReply within a day." };

describe("ArticleEditor", () => {
  it("saves the article's text", async () => {
    const fetchMock = mockApi([["GET", URL, 200, DRAFT], ["PATCH", URL, 200, { ...DRAFT, summary: "Small changes." }]]);
    const user = userEvent.setup();
    render(<ArticleEditor id={5} />);
    await user.type(await screen.findByLabelText(/^summary/i), "Small changes.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PATCH", URL)).toEqual({
      kind: "tip", title: "Make it easy to enquire", summary: "Small changes.", body: "", author_name: "Esi Writer",
    });
  });

  it("formats the selected words with the toolbar", async () => {
    mockApi([["GET", URL, 200, { ...DRAFT, body: "Reply quickly" }]]);
    const user = userEvent.setup();
    render(<ArticleEditor id={5} />);
    const body = (await screen.findByLabelText(/^article text/i)) as HTMLTextAreaElement;
    body.setSelectionRange(6, 13);
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(body.value).toBe("Reply **quickly**");
  });

  it("shows a preview of the text", async () => {
    mockApi([["GET", URL, 200, READY]]);
    const user = userEvent.setup();
    render(<ArticleEditor id={5} />);
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "Answer quickly" })).toBeInTheDocument();
  });

  it("publishes now and can email tip subscribers", async () => {
    const fetchMock = mockApi([
      ["GET", URL, 200, READY],
      ["POST", `${URL}/publish`, 200, { ...READY, status: "published", state: "published", publish_at: "2026-10-11T10:00:00Z" }],
    ]);
    const user = userEvent.setup();
    render(<ArticleEditor id={5} />);
    await user.click(await screen.findByRole("checkbox", { name: /email tip subscribers/i }));
    await user.click(screen.getByRole("button", { name: "Publish now" }));
    expect(await screen.findByText(/^Published/)).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", `${URL}/publish`)).toEqual({ publish_at: null, email_subscribers: true });
  });

  it("shows what is missing before it can be published", async () => {
    mockApi([
      ["GET", URL, 200, DRAFT],
      ["POST", `${URL}/publish`, 400, {
        code: "validation_error", message: "Please check the highlighted fields.",
        fields: { summary: ["Write a short summary before publishing."] },
      }],
    ]);
    const user = userEvent.setup();
    render(<ArticleEditor id={5} />);
    await user.click(await screen.findByRole("button", { name: "Publish now" }));
    expect(await screen.findByText("Write a short summary before publishing.")).toBeInTheDocument();
  });

  it("deletes a draft after asking", async () => {
    const fetchMock = mockApi([["GET", URL, 200, DRAFT], ["DELETE", URL, 204]]);
    const user = userEvent.setup();
    render(<ArticleEditor id={5} />);
    await user.click(await screen.findByRole("button", { name: "Delete draft" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(fetchMock).toHaveBeenCalledWith(URL, expect.objectContaining({ method: "DELETE" }));
    expect(useRouter().push).toHaveBeenCalledWith("/website/articles");
  });
});
