import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ParentRow } from "@/lib/types";
import { mockApi } from "@/test/http";
import { ParentsView } from "./parents-view";

const AKOSUA: ParentRow = {
  id: 21,
  name: "Akosua Mensah",
  title: "Mrs",
  first_name: "Akosua",
  surname: "Mensah",
  phone: "+233245550001",
  alt_phone: "",
  email: "",
  address: "",
  activated: false,
  is_demo: true,
  children: [
    {
      guardianship: 11,
      student: 4,
      name: "Ama Mensah",
      relationship: "MOTHER",
      is_payer: true,
      is_primary_contact: true,
    },
  ],
};

describe("ParentsView", () => {
  it("lists parents with their children, and searches", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([
      ["GET", "/api/school/parents", 200, [AKOSUA]],
      ["GET", "/api/school/parents?q=akosua", 200, [AKOSUA]],
    ]);
    render(<ParentsView canEdit />);
    const card = await screen.findByRole("article", { name: "Akosua Mensah" });
    expect(within(card).getByRole("link", { name: "Ama Mensah" })).toHaveAttribute("href", "/pupils/4");
    expect(within(card).getByText(/Not activated yet/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^name or mobile number/i), "akosua");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/school/parents?q=akosua", expect.anything());
  });

  it("sends the activation text and turns a demo record real", async () => {
    const user = userEvent.setup();
    mockApi([
      ["GET", "/api/school/parents", 200, [AKOSUA]],
      ["POST", "/api/school/parents/21/activation", 200, { sent: true, reason: "" }],
      ["POST", "/api/school/parents/21/make-real", 200, { ...AKOSUA, is_demo: false }],
    ]);
    render(<ParentsView canEdit />);
    const card = await screen.findByRole("article", { name: "Akosua Mensah" });
    await user.click(within(card).getByRole("button", { name: "Send activation text" }));
    expect(await within(card).findByRole("status")).toHaveTextContent("Activation text sent.");
    await user.click(within(card).getByRole("button", { name: "This is now a real record" }));
    expect(await screen.findByRole("article", { name: "Akosua Mensah" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This is now a real record" })).not.toBeInTheDocument();
  });

  it("offers no actions to the Head Teacher", async () => {
    mockApi([["GET", "/api/school/parents", 200, [AKOSUA]]]);
    render(<ParentsView canEdit={false} />);
    const card = await screen.findByRole("article", { name: "Akosua Mensah" });
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });
});
