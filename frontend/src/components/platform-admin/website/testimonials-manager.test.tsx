import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { COMMENT } from "./fixtures";
import { TestimonialsManager } from "./testimonials-manager";

const URL = "/api/platform/website/testimonials";

describe("TestimonialsManager", () => {
  it("adds a comment from a school", async () => {
    const fetchMock = mockApi([["GET", URL, 200, []], ["POST", URL, 201, COMMENT]]);
    const user = userEvent.setup();
    render(<TestimonialsManager />);
    await user.type(await screen.findByLabelText(/^what they said/i), "Parents find us easily now.");
    await user.type(screen.getByLabelText(/^name/i), "Mrs Owusu");
    await user.type(screen.getByLabelText(/^role/i), "Head Teacher");
    await user.type(screen.getByLabelText(/^school/i), "Hope Academy");
    await user.click(screen.getByRole("checkbox", { name: /agreed to have their words/i }));
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    expect(await screen.findByRole("article", { name: "Mrs Owusu" })).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", URL)).toEqual({
      quote: "Parents find us easily now.", person_name: "Mrs Owusu", person_role: "Head Teacher",
      school_name: "Hope Academy", school_slug: "", permission: true, visible: true,
    });
  });

  it("shows the server's reason a comment can't be shown", async () => {
    mockApi([
      ["GET", URL, 200, [{ ...COMMENT, permission: false, visible: false }]],
      ["PATCH", `${URL}/3`, 400, {
        code: "validation_error", message: "Please check the highlighted fields.",
        fields: { permission: ["Tick that this person agreed to have their words and name published before showing it."] },
      }],
    ]);
    const user = userEvent.setup();
    render(<TestimonialsManager />);
    await user.click(await screen.findByRole("button", { name: "Show" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/agreed to have their words/);
  });
});
