import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { FaqsManager } from "./faqs-manager";
import { QUESTION } from "./fixtures";

const URL = "/api/platform/website/faqs";

describe("FaqsManager", () => {
  it("adds and edits a question", async () => {
    const fetchMock = mockApi([
      ["GET", URL, 200, []],
      ["POST", URL, 201, QUESTION],
      ["PATCH", `${URL}/7`, 200, { ...QUESTION, answer: "About five working days." }],
    ]);
    const user = userEvent.setup();
    render(<FaqsManager />);
    await user.type(await screen.findByLabelText(/^question/i), "How long does setup take?");
    await user.type(screen.getByLabelText(/^answer/i), "About a week.");
    await user.click(screen.getByRole("button", { name: "Add question" }));
    const item = await screen.findByRole("article", { name: "How long does setup take?" });
    expect(bodyOf(fetchMock, "POST", URL)).toEqual({ question: "How long does setup take?", answer: "About a week." });

    await user.click(within(item).getByRole("button", { name: "Edit" }));
    const answer = within(item).getByLabelText(/^answer/i);
    await user.clear(answer);
    await user.type(answer, "About five working days.");
    await user.click(within(item).getByRole("button", { name: "Save" }));
    expect(await within(item).findByText("About five working days.")).toBeInTheDocument();
  });

  it("deletes a question after asking", async () => {
    const fetchMock = mockApi([["GET", URL, 200, [QUESTION]], ["DELETE", `${URL}/7`, 204]]);
    const user = userEvent.setup();
    render(<FaqsManager />);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByText("No questions yet.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`${URL}/7`, expect.objectContaining({ method: "DELETE" }));
  });
});
