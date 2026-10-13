import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { describe, expect, it } from "vitest";
import type { ClassesData, PupilRow } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { PupilsView } from "./pupils-view";

const AMA: PupilRow = {
  id: 1,
  student_id: "2600017",
  name: "Ama Mensah",
  class: "Basic 2A",
  class_id: 9,
  band: "lower_primary",
  status: "ACTIVE",
  is_demo: false,
  contacts_incomplete: true,
  initials: "AM",
  has_photo: false,
};
const YAW: PupilRow = { ...AMA, id: 2, name: "Yaw Boateng", initials: "YB", contacts_incomplete: false, is_demo: true };
const CLASSES: ClassesData = {
  year: { id: 2, name: "2026/2027" },
  years: [{ id: 2, name: "2026/2027", is_current: true }],
  classes: [
    {
      id: 9,
      name: "Basic 2A",
      year_group: "basic_2",
      stream: "A",
      band: "lower_primary",
      academic_year: 2,
      pupils: 1,
      class_teachers: [],
    },
  ],
  year_groups: [],
  terms: [],
  teachers: [],
};

describe("PupilsView", () => {
  it("lists pupils with what needs attention, and searches", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      ["GET", "/api/school/pupils", 200, [AMA, YAW]],
      ["GET", "/api/school/pupils?q=boat&class=9", 200, [YAW]],
    ]);
    render(<PupilsView canEdit />);
    const ama = (await screen.findByRole("link", { name: "Ama Mensah" })).closest("li") as HTMLElement;
    expect(within(ama).getByText("Fewer than 2 emergency contacts")).toBeInTheDocument();
    const yaw = screen.getByRole("link", { name: "Yaw Boateng" }).closest("li") as HTMLElement;
    expect(within(yaw).getByText("Demo")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^name or student id/i), "boat");
    await user.selectOptions(screen.getByLabelText(/^class/i), "Basic 2A");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("1 pupil")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/school/pupils?q=boat&class=9", expect.anything());
  });

  it("admits a pupil and opens their record", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      ["GET", "/api/school/pupils", 200, []],
      ["POST", "/api/school/pupils", 201, { ...AMA, id: 7 }],
    ]);
    render(<PupilsView canEdit />);
    await user.click(await screen.findByRole("button", { name: "Admit a pupil" }));
    const form = screen.getByRole("form", { name: "Admit a pupil" });
    await user.type(within(form).getByLabelText(/^first name/i), "Ama");
    await user.type(within(form).getByLabelText(/^surname/i), "Mensah");
    await user.type(within(form).getByLabelText(/^date of birth/i), "2019-03-14");
    await user.selectOptions(within(form).getByLabelText(/^gender/i), "Female");
    await user.selectOptions(within(form).getByLabelText(/^first class/i), "Basic 2A");
    await user.click(within(form).getByRole("button", { name: "Admit" }));
    expect(useRouter().push).toHaveBeenCalledWith("/pupils/7");
    expect(bodyOf(fetchMock, "POST", "/api/school/pupils")).toMatchObject({
      first_name: "Ama",
      surname: "Mensah",
      date_of_birth: "2019-03-14",
      gender: "F",
      school_class: 9,
    });
  });

  it("asks for the missing details before sending", async () => {
    const user = userEvent.setup();
    mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      ["GET", "/api/school/pupils", 200, []],
    ]);
    render(<PupilsView canEdit />);
    await user.click(await screen.findByRole("button", { name: "Admit a pupil" }));
    await user.click(screen.getByRole("button", { name: "Admit" }));
    expect(await screen.findAllByText("Fill this in.")).toHaveLength(3);
  });

  it("offers no admission to the Head Teacher", async () => {
    mockApi([
      ["GET", "/api/school/classes", 200, CLASSES],
      ["GET", "/api/school/pupils", 200, [AMA]],
    ]);
    render(<PupilsView canEdit={false} />);
    expect(await screen.findByRole("link", { name: "Ama Mensah" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Admit a pupil" })).not.toBeInTheDocument();
  });
});
