import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { FamilyConsents, WardCard } from "@/lib/types";
import { bodyOf, mockApi } from "@/test/http";
import { ConsentView, FamilyHome, WardsView } from "./family-views";

const UNCLE = {
  id: 31,
  name: "Uncle Kofi",
  relationship: "Uncle",
  phone: "+233247770001",
  valid_to: null,
  has_photo: false,
};
const AMA: WardCard = {
  id: 4,
  student_id: "2600017",
  name: "Ama Mensah",
  first_name: "Ama",
  class: "Basic 2A",
  initials: "AM",
  has_photo: false,
  class_teacher: "Abena Owusu",
  pickups: [UNCLE],
};
const YAW: WardCard = {
  ...AMA,
  id: 5,
  name: "Yaw Mensah",
  first_name: "Yaw",
  class: "KG 1",
  initials: "YM",
  pickups: [],
};
const PHOTO = {
  type: "PHOTO_USE",
  label: "Photos may be used",
  given: null,
  given_at: null,
  withdrawn_at: null,
  notice_version: null,
};
const NOTICE = {
  title: "How we use data",
  version: "3",
  effective_from: "2026-01-01",
  body: "## Photos\n\nOnly with consent.",
};
const CONSENTS: FamilyConsents = {
  notice: NOTICE,
  wards: [{ id: 4, name: "Ama Mensah", consents: [PHOTO] }],
  own: [{ ...PHOTO, type: "SMS_CONTACT", label: "Non-essential SMS messages" }],
};

describe("FamilyHome", () => {
  it("greets the parent with their children and the consents still to answer", async () => {
    mockApi([
      ["GET", "/api/parent/wards", 200, [AMA, YAW]],
      ["GET", "/api/parent/consents", 200, CONSENTS],
    ]);
    render(<FamilyHome />);
    expect(await screen.findByRole("link", { name: /Ama Mensah/ })).toHaveAttribute("href", "/wards?child=4");
    expect(await screen.findByText(/2 consents still to answer/i)).toBeInTheDocument();
  });

  it("says so when no child is linked yet", async () => {
    mockApi([
      ["GET", "/api/parent/wards", 200, []],
      ["GET", "/api/parent/consents", 200, { ...CONSENTS, wards: [], own: [] }],
    ]);
    render(<FamilyHome />);
    expect(await screen.findByText(/no children are linked to your account yet/i)).toBeInTheDocument();
  });
});

describe("WardsView", () => {
  it("shows one child at a time, switched with name chips or a swipe", async () => {
    const user = userEvent.setup();
    mockApi([["GET", "/api/parent/wards", 200, [AMA, YAW]]]);
    render(<WardsView />);
    const card = await screen.findByRole("region", { name: "Ama Mensah" });
    expect(within(card).getByText("Class teacher: Abena Owusu")).toBeInTheDocument();
    expect(within(card).getByText(/Uncle Kofi/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yaw" }));
    expect(screen.getByRole("region", { name: "Yaw Mensah" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yaw" })).toHaveAttribute("aria-pressed", "true");
    const yaw = screen.getByRole("region", { name: "Yaw Mensah" });
    fireEvent.pointerDown(yaw, { clientX: 200 });
    fireEvent.pointerUp(yaw, { clientX: 300 });
    expect(screen.getByRole("region", { name: "Ama Mensah" })).toBeInTheDocument();
  });
});

describe("ConsentView", () => {
  it("shows the privacy notice and records a parent's answer", async () => {
    const user = userEvent.setup();
    const given = { ...PHOTO, given: true, given_at: "2026-10-13T09:00:00Z", notice_version: "3" };
    const fetchMock = mockApi([
      ["GET", "/api/parent/consents", 200, CONSENTS],
      ["PUT", "/api/parent/consents", 200, given],
    ]);
    render(<ConsentView />);
    expect(await screen.findByRole("heading", { name: "How we use data" })).toBeInTheDocument();
    expect(screen.getByText("Only with consent.")).toBeInTheDocument();
    const ama = screen.getByRole("region", { name: "Ama Mensah" });
    const photo = within(ama).getByRole("article", { name: "Photos may be used" });
    await user.click(within(photo).getByRole("button", { name: "Given" }));
    expect(await within(ama).findByText(/Given on/)).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PUT", "/api/parent/consents")).toEqual({ student: 4, type: "PHOTO_USE", given: true });
    expect(screen.getByText(/safety, security and payment messages are always sent/i)).toBeInTheDocument();
  });
});
