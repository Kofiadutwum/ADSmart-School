import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { TeamMember } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { TeamView } from "./team-view";

const OWNER: TeamMember = {
  id: 1, name: "Kojo Ops", username: "ops", phone: "+233244000011", email: "",
  roles: ["Platform Owner"], is_active: true, last_sign_in: null,
};
const AMA: TeamMember = {
  id: 2, name: "Ama Mensah", username: "ama", phone: "", email: "ama@example.com",
  roles: ["Platform Content"], is_active: true, last_sign_in: null,
};

describe("TeamView", () => {
  it("lists members with their roles", async () => {
    mockApi([["GET", "/api/platform/team", 200, [OWNER, AMA]]]);
    render(<TeamView />);
    const ama = await screen.findByRole("article", { name: "Ama Mensah" });
    expect(within(ama).getByRole("checkbox", { name: "Content" })).toBeChecked();
    expect(within(ama).getByRole("checkbox", { name: "Owner" })).not.toBeChecked();
  });

  it("adds a member and shows the one-time password once", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/platform/team", 200, [OWNER]],
      ["POST", "/api/platform/team", 201, { member: AMA, one_time_password: "abcd-efgh-jkmn" }],
    ]);
    const user = userEvent.setup();
    render(<TeamView />);
    await user.click(await screen.findByRole("button", { name: "Add a team member" }));
    await user.type(screen.getByLabelText(/^first name/i), "Ama");
    await user.type(screen.getByLabelText(/^surname/i), "Mensah");
    await user.type(screen.getByLabelText(/^username/i), "ama");
    await user.type(screen.getByLabelText(/^email/i), "ama@example.com");
    const form = screen.getByRole("form", { name: "Add a team member" });
    await user.click(within(form).getByRole("checkbox", { name: "Content" }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByTestId("one-time-password")).toHaveTextContent("abcd-efgh-jkmn");
    expect(bodyOf(fetchMock, "POST", "/api/platform/team")).toEqual({
      first_name: "Ama", surname: "Mensah", username: "ama", phone: "", email: "ama@example.com",
      roles: ["Platform Content"],
    });
  });

  it("needs a role and a mobile number or email before sending", async () => {
    const fetchMock = mockApi([["GET", "/api/platform/team", 200, [OWNER]]]);
    const user = userEvent.setup();
    render(<TeamView />);
    await user.click(await screen.findByRole("button", { name: "Add a team member" }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Choose at least one role.")).toBeInTheDocument();
    expect(screen.getByText("Give a mobile number or an email address.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("changes roles", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/platform/team", 200, [OWNER, AMA]],
      ["PATCH", "/api/platform/team/2", 200, { ...AMA, roles: ["Platform Content", "Platform Support"] }],
    ]);
    const user = userEvent.setup();
    render(<TeamView />);
    const ama = await screen.findByRole("article", { name: "Ama Mensah" });
    await user.click(within(ama).getByRole("checkbox", { name: "Support" }));
    await user.click(within(ama).getByRole("button", { name: "Save roles" }));
    expect(await within(ama).findByText("Roles saved.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PATCH", "/api/platform/team/2")).toEqual({
      roles: ["Platform Content", "Platform Support"],
    });
  });

  it("shows the server's reason when the last Owner would be lost", async () => {
    mockApi([
      ["GET", "/api/platform/team", 200, [OWNER]],
      ["PATCH", "/api/platform/team/1", 400, {
        code: "last_owner", message: "The team must keep at least one active Owner.", fields: {},
      }],
    ]);
    const user = userEvent.setup();
    render(<TeamView />);
    const owner = await screen.findByRole("article", { name: "Kojo Ops" });
    await user.click(within(owner).getByRole("button", { name: "Switch off" }));
    expect(await within(owner).findByRole("alert")).toHaveTextContent("at least one active Owner");
  });
});
