import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/http";
import { MyTeachingView } from "./my-teaching-view";

describe("MyTeachingView", () => {
  it("lists the classes taught and the classes looked after, by term", async () => {
    mockApi([
      [
        "GET",
        "/api/school/me",
        200,
        {
          roles: ["Teacher"],
          staff: { id: 3, name: "Abena Owusu" },
          teaching: [
            {
              id: 1,
              class: "Basic 2A",
              class_id: 5,
              subject: "Mathematics",
              term: 1,
              term_id: 9,
            },
          ],
          class_teacher_of: [{ id: 2, class: "Basic 2A", class_id: 5, term: 1, term_id: 9 }],
        },
      ],
    ]);
    render(<MyTeachingView />);
    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText(/class teacher of/i)).toHaveTextContent("Basic 2A");
    expect(screen.getByRole("heading", { name: "Term 1" })).toBeInTheDocument();
  });

  it("says plainly when nothing is assigned yet", async () => {
    mockApi([["GET", "/api/school/me", 200, { roles: ["Teacher"], staff: null, teaching: [], class_teacher_of: [] }]]);
    render(<MyTeachingView />);
    expect(await screen.findByText(/no classes are assigned to you/i)).toBeInTheDocument();
  });
});
