import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SchoolProfile } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { ProfileForm } from "./profile-form";

const PROFILE: SchoolProfile = {
  name: "Sample School",
  slug: "sample",
  motto: "",
  founded_year: 2001,
  address: "",
  town: "Kumasi",
  region: "Ashanti",
  ghana_post_gps: "",
  phone: "+233200000000",
  whatsapp: "",
  email: "office@example.com",
  map_query: "",
  levels_offered: ["kg", "lower_primary"],
  brand_primary: "#0f1a9e",
  brand_accent: "#f5a524",
  logo: null,
  level_choices: [
    { code: "kg", name: "Kindergarten" },
    { code: "lower_primary", name: "Basic 1–3" },
    { code: "jhs", name: "Junior High School" },
  ],
};

describe("ProfileForm", () => {
  it("saves the changed profile", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/school/profile", 200, PROFILE],
      [
        "PATCH",
        "/api/school/profile",
        200,
        {
          ...PROFILE,
          motto: "Knowledge is light",
          levels_offered: ["kg", "lower_primary", "jhs"],
        },
      ],
    ]);
    const user = userEvent.setup();
    render(<ProfileForm canEdit />);
    await user.type(
      await screen.findByLabelText(/^motto/i),
      "Knowledge is light",
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Junior High School" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    const sent = bodyOf(
      fetchMock,
      "PATCH",
      "/api/school/profile",
    ) as Partial<SchoolProfile>;
    expect(sent.motto).toBe("Knowledge is light");
    expect(sent.levels_offered).toEqual(["kg", "lower_primary", "jhs"]);
  });

  it("shows the server's colour advice and applies its suggestion", async () => {
    mockApi([
      ["GET", "/api/school/profile", 200, PROFILE],
      [
        "PATCH",
        "/api/school/profile",
        400,
        {
          code: "validation_error",
          message: "Please check the highlighted fields.",
          fields: {
            brand_primary: [
              "#ffff00 is too light for white text and links (1.1:1; it needs 4.5:1). Try #6b6b00.",
            ],
          },
        },
      ],
    ]);
    const user = userEvent.setup();
    render(<ProfileForm canEdit />);
    const primary = await screen.findByLabelText(/^main colour/i);
    await user.clear(primary);
    await user.type(primary, "#ffff00");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(/too light for white text/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use #6b6b00" }));
    expect(primary).toHaveValue("#6b6b00");
  });

  it("is read-only for the Head Teacher", async () => {
    mockApi([["GET", "/api/school/profile", 200, PROFILE]]);
    render(<ProfileForm canEdit={false} />);
    expect(await screen.findByLabelText(/^town/i)).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });
});
