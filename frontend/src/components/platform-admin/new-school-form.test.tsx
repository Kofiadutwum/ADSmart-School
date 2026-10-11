import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { NewSchoolForm } from "./new-school-form";

const DETAIL = {
  slug: "hope-academy", name: "Hope Academy", town: "Tema", region: "Greater Accra Region", status: "trial",
  is_public: false, to_do: 4, created_at: "2026-10-10T09:00:00Z", url: "http://hope-academy.localhost:3000",
  phone: "+233201112233", email: "office@hope.example", levels_offered: ["kg"], blockers: [],
  counts: { pupils: 0, staff: 1, parents: 0, enquiries: 0 }, administrators: [],
};

async function fill(user: UserEvent) {
  await user.type(screen.getByLabelText(/^school name/i), "Hope Academy");
  await user.type(screen.getByLabelText(/^town/i), "Tema");
  await user.type(screen.getByLabelText(/^region/i), "Greater Accra Region");
  await user.type(screen.getByLabelText(/^school phone/i), "020 111 2233");
  await user.type(screen.getByLabelText(/^school email/i), "office@hope.example");
  await user.type(screen.getByLabelText(/^first name/i), "Esi");
  await user.type(screen.getByLabelText(/^surname/i), "Owusu");
  await user.type(screen.getByLabelText(/^username/i), "esi.owusu");
  await user.type(screen.getByLabelText(/^mobile number/i), "024 765 4321");
  await user.type(screen.getByLabelText(/^email/i), "esi@hope.example");
}

describe("add a school", () => {
  it("suggests the web address from the name until it is edited", async () => {
    mockApi([]);
    const user = userEvent.setup();
    render(<NewSchoolForm />);
    await user.type(screen.getByLabelText(/^school name/i), "St. Mary's Academy");
    const address = screen.getByLabelText(/^web address/i);
    expect(address).toHaveValue("st-marys-academy");
    await user.clear(address);
    await user.type(address, "stmarys");
    await user.type(screen.getByLabelText(/^school name/i), " Kumasi");
    expect(address).toHaveValue("stmarys");
  });

  it("asks for every field before sending anything", async () => {
    const fetchMock = mockApi([]);
    const user = userEvent.setup();
    render(<NewSchoolForm />);
    await user.click(screen.getByRole("button", { name: "Add the school" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please check the highlighted fields.");
    expect(screen.getAllByText("Fill this in.")).toHaveLength(10);
    expect(bodyOf(fetchMock, "POST", "/api/platform/schools")).toBeUndefined();
  });

  it("adds the school and shows the one-time password once", async () => {
    const fetchMock = mockApi([
      [
        "POST",
        "/api/platform/schools",
        201,
        { school: DETAIL, administrator: { username: "esi.owusu", one_time_password: "abcd-efgh-jkmn" } },
      ],
    ]);
    const user = userEvent.setup();
    render(<NewSchoolForm />);
    await fill(user);
    await user.click(screen.getByLabelText("Crèche"));
    await user.click(screen.getByRole("button", { name: "Add the school" }));

    const heading = await screen.findByRole("heading", { name: "Hope Academy is set up" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByTestId("one-time-password")).toHaveTextContent("abcd-efgh-jkmn");
    expect(bodyOf(fetchMock, "POST", "/api/platform/schools")).toEqual({
      name: "Hope Academy",
      slug: "hope-academy",
      town: "Tema",
      region: "Greater Accra Region",
      phone: "020 111 2233",
      email: "office@hope.example",
      levels_offered: ["nursery", "kg", "lower_primary", "upper_primary", "jhs"],
      administrator: { first_name: "Esi", surname: "Owusu", username: "esi.owusu", phone: "024 765 4321", email: "esi@hope.example" },
    });
  });

  it("shows the server's field errors, the Administrator's included", { timeout: 15_000 }, async () => {
    mockApi([
      [
        "POST",
        "/api/platform/schools",
        400,
        {
          code: "validation_error",
          message: "Please check the highlighted fields.",
          fields: {
            slug: ["“hope-academy” is taken."],
            "administrator.username": ["Usernames start with a letter."],
          },
        },
      ],
    ]);
    const user = userEvent.setup();
    render(<NewSchoolForm />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Add the school" }));
    expect(await screen.findByText("“hope-academy” is taken.")).toBeInTheDocument();
    expect(screen.getByText("Usernames start with a letter.")).toBeInTheDocument();
  });
});
