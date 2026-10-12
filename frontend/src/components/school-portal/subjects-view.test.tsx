import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { SubjectsView } from "./subjects-view";

const MATHS = {
  id: 1,
  name: "Mathematics",
  code: "MATH",
  bands: ["lower_primary", "upper_primary"],
  is_learning_area: false,
};

describe("SubjectsView", () => {
  it("adds a subject for chosen levels", async () => {
    const numeracy = {
      ...MATHS,
      id: 2,
      name: "Numeracy",
      code: "NUM",
      bands: ["kg"],
      is_learning_area: true,
    };
    const fetchMock = mockApi([
      ["GET", "/api/school/subjects", 200, []],
      ["POST", "/api/school/subjects", 201, numeracy],
    ]);
    const user = userEvent.setup();
    render(<SubjectsView canEdit />);
    const form = await screen.findByRole("form", { name: "Add a subject" });
    await user.type(within(form).getByLabelText(/^name/i), "Numeracy");
    await user.type(within(form).getByLabelText(/^code/i), "NUM");
    await user.click(within(form).getByRole("checkbox", { name: "KG" }));
    await user.click(within(form).getByRole("checkbox", { name: /learning area/i }));
    await user.click(within(form).getByRole("button", { name: "Add subject" }));
    expect(await screen.findByRole("article", { name: "Numeracy" })).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/school/subjects")).toEqual({
      name: "Numeracy",
      code: "NUM",
      bands: ["kg"],
      is_learning_area: true,
    });
  });

  it("edits a subject", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/school/subjects", 200, [MATHS]],
      ["PATCH", "/api/school/subjects/1", 200, { ...MATHS, name: "Maths" }],
    ]);
    const user = userEvent.setup();
    render(<SubjectsView canEdit />);
    const card = await screen.findByRole("article", { name: "Mathematics" });
    await user.click(within(card).getByRole("button", { name: "Edit" }));
    const name = within(card).getByLabelText(/^name/i);
    await user.clear(name);
    await user.type(name, "Maths");
    await user.click(within(card).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("article", { name: "Maths" })).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PATCH", "/api/school/subjects/1")).toMatchObject({
      name: "Maths",
    });
  });

  it("shows the levels and offers no changes to the Head Teacher", async () => {
    mockApi([["GET", "/api/school/subjects", 200, [MATHS]]]);
    render(<SubjectsView canEdit={false} />);
    const card = await screen.findByRole("article", { name: "Mathematics" });
    expect(within(card).getByText("MATH · Basic 1–3, Basic 4–6")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Add a subject" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });
});
