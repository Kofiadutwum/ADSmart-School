import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ConsentRow, GuardianRow, PickupRow, PupilDetail } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { ChangesTab, ConsentsTab, ParentsTab, PickupsTab } from "./pupil-tabs";

const PUPIL = { id: 4, name: "Ama Mensah" } as PupilDetail;
const URL = "/api/school/pupils/4";
const MOTHER: GuardianRow = {
  id: 11,
  parent: 21,
  name: "Akosua Mensah",
  phone: "+233245550001",
  relationship: "MOTHER",
  is_payer: true,
  is_primary_contact: true,
  activated: false,
  is_demo: false,
};
const FATHER_LINK = {
  guardianship: 12,
  student: 4,
  name: "Ama Mensah",
  relationship: "FATHER",
  is_payer: false,
  is_primary_contact: false,
};
const UNCLE: PickupRow = {
  id: 31,
  name: "Uncle Kofi",
  phone: "+233247770001",
  relationship: "Uncle",
  valid_from: "2026-09-01",
  valid_to: null,
  is_current: true,
  has_photo: false,
  is_demo: false,
};
const PHOTO: ConsentRow = {
  type: "PHOTO_USE",
  label: "Photos may be used",
  given: null,
  given_at: null,
  withdrawn_at: null,
  notice_version: null,
};

describe("ParentsTab", () => {
  it("lists parents and sends the activation text", async () => {
    const user = userEvent.setup();
    mockApi([
      ["GET", `${URL}/guardians`, 200, [MOTHER]],
      ["POST", "/api/school/parents/21/activation", 200, { sent: false, reason: "demo" }],
    ]);
    render(<ParentsTab pupil={PUPIL} canEdit />);
    const mother = await screen.findByRole("article", { name: "Akosua Mensah" });
    expect(within(mother).getByText(/Mother/)).toBeInTheDocument();
    expect(within(mother).getByText("Not activated yet")).toBeInTheDocument();
    await user.click(within(mother).getByRole("button", { name: "Send activation text" }));
    expect(await within(mother).findByRole("status")).toHaveTextContent("Not sent: demo numbers are never texted.");
  });

  it("adds a new parent linked to the pupil", async () => {
    const user = userEvent.setup();
    const created = {
      id: 22,
      name: "Kojo Mensah",
      title: "",
      first_name: "Kojo",
      surname: "Mensah",
      phone: "+233245550002",
      alt_phone: "",
      email: "",
      address: "",
      activated: false,
      is_demo: false,
      children: [FATHER_LINK],
    };
    const fetchMock = mockApi([
      ["GET", `${URL}/guardians`, 200, []],
      ["POST", "/api/school/parents", 201, created],
    ]);
    render(<ParentsTab pupil={PUPIL} canEdit />);
    const form = await screen.findByRole("form", { name: "Add a new parent" });
    await user.type(within(form).getByLabelText(/^first name/i), "Kojo");
    await user.type(within(form).getByLabelText(/^surname/i), "Mensah");
    await user.type(within(form).getByLabelText(/^mobile number/i), "024 555 0002");
    await user.selectOptions(within(form).getByLabelText(/^relationship/i), "Father");
    await user.click(within(form).getByRole("button", { name: "Add parent" }));
    expect(await screen.findByRole("article", { name: "Kojo Mensah" })).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/school/parents")).toMatchObject({
      first_name: "Kojo",
      phone: "024 555 0002",
      link: { student: 4, relationship: "FATHER", is_payer: false, is_primary_contact: false },
    });
  });
});

describe("PickupsTab", () => {
  it("adds a pick-up person and ends one", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([
      ["GET", `${URL}/pickups`, 200, []],
      ["POST", `${URL}/pickups`, 201, UNCLE],
      ["POST", "/api/school/pickups/31/end", 200, { ...UNCLE, valid_to: "2026-10-13" }],
    ]);
    render(<PickupsTab pupil={PUPIL} canEdit />);
    const form = await screen.findByRole("form", { name: "Add a pick-up person" });
    await user.type(within(form).getByLabelText(/^name/i), "Uncle Kofi");
    await user.type(within(form).getByLabelText(/^mobile number/i), "024 777 0001");
    await user.type(within(form).getByLabelText(/^relationship/i), "Uncle");
    await user.click(within(form).getByRole("button", { name: "Add" }));
    const person = await screen.findByRole("article", { name: "Uncle Kofi" });
    expect(bodyOf(fetchMock, "POST", `${URL}/pickups`)).toMatchObject({
      name: "Uncle Kofi",
      relationship: "Uncle",
    });
    await user.click(within(person).getByRole("button", { name: "End" }));
    expect(await within(person).findByText(/until 2026-10-13/)).toBeInTheDocument();
  });
});

describe("ConsentsTab", () => {
  it("records a consent as given", async () => {
    const user = userEvent.setup();
    const given = { ...PHOTO, given: true, given_at: "2026-10-13T09:00:00Z", notice_version: "2" };
    const fetchMock = mockApi([
      ["GET", `${URL}/consents`, 200, [PHOTO]],
      ["PUT", `${URL}/consents/PHOTO_USE`, 200, given],
    ]);
    render(<ConsentsTab pupil={PUPIL} canEdit />);
    const row = await screen.findByRole("article", { name: "Photos may be used" });
    expect(within(row).getByText("Not asked yet")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Given" }));
    expect(await within(row).findByText(/Given on/)).toBeInTheDocument();
    expect(within(row).getByText(/privacy notice version 2/i)).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PUT", `${URL}/consents/PHOTO_USE`)).toEqual({ given: true });
  });
});

describe("ChangesTab", () => {
  it("lists changes with what changed", async () => {
    const entry = {
      id: 1,
      created_at: "2026-10-13T09:00:00Z",
      actor_id: 7,
      actor_name: "Ama Admin",
      action: "STATUS_CHANGED",
      action_label: "Status changed",
      entity_type: "people.student",
      entity_id: "4",
      reason: "Moved to Accra",
      old: { status: "ACTIVE" },
      new: { status: "WITHDRAWN" },
    };
    mockApi([["GET", `${URL}/history`, 200, [entry]]]);
    render(<ChangesTab pupil={PUPIL} />);
    expect(await screen.findByRole("cell", { name: "Status changed" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "status: ACTIVE → WITHDRAWN. Moved to Accra" })).toBeInTheDocument();
  });
});
