import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/http";
import { ImportView } from "./import-view";

const PUPILS = "/api/school/import/pupils";
const STAFF = "/api/school/import/staff";
const SUMMARY = { pupils: 2, new_parents: 1, existing_parents: 1, classes: ["Basic 2A"], unplaced: 0 };
const file = (name = "pupils.csv") => new File(["First name"], name, { type: "text/csv" });
const CLEAN = { kind: "pupils", imported: false, problems: [], summary: SUMMARY };
const SAVED = { kind: "pupils", imported: true, problems: [], summary: SUMMARY };

describe("ImportView", () => {
  it("lists a file's problems by row, then imports it once it is clean", async () => {
    const fetchMock = mockApi([
      [
        "POST",
        PUPILS,
        200,
        { kind: "pupils", imported: false, problems: [{ row: 3, message: "Surname is missing." }], summary: SUMMARY },
      ],
      ["POST", PUPILS, 200, CLEAN],
      ["POST", PUPILS, 200, { ...SAVED, done: 2, total: 2 }],
    ]);
    const user = userEvent.setup();
    render(<ImportView initialKind="pupils" />);
    expect(screen.getByRole("link", { name: /download the template/i })).toHaveAttribute("href", `${PUPILS}/template`);

    await user.upload(screen.getByLabelText(/spreadsheet file/i), file());
    await user.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText("Row 3: Surname is missing.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^import/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText(/ready to import 2 pupils/i)).toHaveTextContent(
      "1 new parent account, 1 parent already registered, placed in Basic 2A",
    );
    expect(screen.getByRole("button", { name: "Import 2 pupils" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /privacy notice/i }));
    await user.click(screen.getByRole("button", { name: "Import 2 pupils" }));
    expect(await screen.findByText(/imported 2 pupils/i)).toBeInTheDocument();
    const sent = fetchMock.mock.calls[2][1]?.body as FormData;
    expect(sent.get("commit")).toBe("1");
    expect(sent.get("privacy_notice_given")).toBe("1");
    expect([sent.get("start"), sent.get("count")]).toEqual(["0", "50"]);
    expect((sent.get("file") as File).name).toBe("pupils.csv");
    expect((fetchMock.mock.calls[0][1]?.body as FormData).get("commit")).toBeNull();
  });

  it("saves in batches and carries on from where a dropped connection stopped", async () => {
    const fetchMock = mockApi([
      ["POST", PUPILS, 200, CLEAN],
      ["POST", PUPILS, 200, { ...SAVED, done: 50, total: 120 }],
      ["POST", PUPILS, 503, { code: "unavailable", message: "The server is busy.", fields: {} }],
      ["POST", PUPILS, 200, { ...SAVED, done: 100, total: 120 }],
      ["POST", PUPILS, 200, { ...SAVED, done: 120, total: 120 }],
    ]);
    const user = userEvent.setup();
    render(<ImportView initialKind="pupils" />);
    await user.upload(screen.getByLabelText(/spreadsheet file/i), file());
    await user.click(screen.getByRole("button", { name: "Check the file" }));
    await user.click(await screen.findByRole("checkbox", { name: /privacy notice/i }));
    await user.click(screen.getByRole("button", { name: "Import 2 pupils" }));

    expect(await screen.findByText(/50 of 120 rows saved/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue importing" }));

    expect(await screen.findByText(/imported 2 pupils/i)).toBeInTheDocument();
    const starts = fetchMock.mock.calls.slice(1).map((call) => (call[1]?.body as FormData).get("start"));
    expect(starts).toEqual(["0", "50", "50", "100"]);
  });

  it("shows staff one-time passwords once, ready to print", async () => {
    mockApi([
      ["POST", STAFF, 200, { kind: "staff", imported: false, problems: [], summary: { staff: 1 } }],
      [
        "POST",
        STAFF,
        200,
        {
          kind: "staff",
          imported: true,
          problems: [],
          summary: { staff: 1 },
          done: 1,
          total: 1,
          passwords: [{ name: "Abena Owusu", username: "abena", one_time_password: "tulip-river-42" }],
        },
      ],
    ]);
    const user = userEvent.setup();
    render(<ImportView initialKind="pupils" />);
    await user.click(screen.getByRole("radio", { name: /staff/i }));
    expect(screen.getByRole("link", { name: /download the template/i })).toHaveAttribute("href", `${STAFF}/template`);

    await user.upload(screen.getByLabelText(/spreadsheet file/i), file("staff.xlsx"));
    await user.click(screen.getByRole("button", { name: "Check the file" }));
    await user.click(await screen.findByRole("checkbox", { name: /privacy notice/i }));
    await user.click(screen.getByRole("button", { name: "Import 1 staff member" }));
    const table = await screen.findByRole("table", { name: /one-time passwords/i });
    expect(within(table).getByText("tulip-river-42")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
  });

  it("collects pupils' Student IDs and new parents' passwords from every batch", async () => {
    mockApi([
      ["POST", PUPILS, 200, CLEAN],
      [
        "POST",
        PUPILS,
        200,
        {
          ...SAVED,
          done: 1,
          total: 2,
          pupils: [{ name: "Kofi Mensah", class: "Basic 5A", student_id: "ADS-2026-0001", password: "abcd-efgh-jkmn" }],
          parents: [{ name: "Ama Mensah", phone: "024 123 4567", children: ["Kofi"], password: "pqrs-tuvw-xyz2" }],
        },
      ],
      [
        "POST",
        PUPILS,
        200,
        {
          ...SAVED,
          done: 2,
          total: 2,
          pupils: [{ name: "Esi Mensah", class: "KG 1", student_id: "ADS-2026-0002", password: "" }],
          parents: [],
        },
      ],
    ]);
    const user = userEvent.setup();
    render(<ImportView initialKind="pupils" />);
    await user.upload(screen.getByLabelText(/spreadsheet file/i), file());
    await user.click(screen.getByRole("button", { name: "Check the file" }));
    await user.click(await screen.findByRole("checkbox", { name: /privacy notice/i }));
    await user.click(screen.getByRole("button", { name: "Import 2 pupils" }));

    const pupils = await screen.findByRole("table", { name: /student ids/i });
    expect(within(pupils).getByText("ADS-2026-0001")).toBeInTheDocument();
    expect(within(pupils).getByText("abcd-efgh-jkmn")).toBeInTheDocument();
    expect(within(pupils).getByText("ADS-2026-0002")).toBeInTheDocument();
    const parents = screen.getByRole("table", { name: /parents' sign-ins/i });
    expect(within(parents).getByText("024 123 4567")).toBeInTheDocument();
    expect(within(parents).getByText("pqrs-tuvw-xyz2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /download \(csv\)/i })).toHaveLength(2);
  });
});
