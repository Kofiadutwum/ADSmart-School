import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { RecordsView, type FieldSpec } from "./records-view";

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", required: true },
  { name: "amount", label: "Amount", type: "money", required: true },
  { name: "term", label: "Term", type: "option", options: "terms-for-test" },
  { name: "optional", label: "Optional", type: "boolean" },
  { name: "status", label: "Status", readOnly: true, type: "choice", choices: [["PENDING", "Waiting for approval"]] },
];

describe("RecordsView", () => {
  it("lists records with money, related names and choices readable", async () => {
    mockApi([
      ["GET", "/api/test/fees", 200, [{ id: 1, name: "Tuition", amount: 150_000, term: 4, term_label: "Term 1", optional: false, status: "PENDING" }]],
    ]);
    render(<RecordsView path="/api/test/fees" noun="fee" fields={FIELDS} />);
    expect(await screen.findByText("Tuition")).toBeInTheDocument();
    expect(screen.getByText("GH₵1,500.00")).toBeInTheDocument();
    expect(screen.getByText("Term 1")).toBeInTheDocument();
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add fee" })).not.toBeInTheDocument();
  });

  it("adds a record, sending cedis as pesewas and choices as ids", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/test/fees", 200, []],
      ["GET", "/api/school/options/terms-for-test", 200, [{ id: 4, name: "Term 1" }]],
      ["POST", "/api/test/fees", 201, { id: 2, name: "PTA", amount: 5_000, term: 4, term_label: "Term 1", optional: true, status: "PENDING" }],
    ]);
    const user = userEvent.setup();
    render(<RecordsView path="/api/test/fees" noun="fee" fields={FIELDS} canAdd />);
    await user.click(await screen.findByRole("button", { name: "Add fee" }));
    await user.type(screen.getByLabelText(/^name/i), "PTA");
    await user.type(screen.getByLabelText(/^amount/i), "50");
    await screen.findByRole("option", { name: "Term 1" });
    await user.selectOptions(screen.getByLabelText(/^term/i), "4");
    await user.click(screen.getByRole("checkbox", { name: "Optional" }));
    await user.click(screen.getByRole("button", { name: "Add fee" }));
    expect(await screen.findByText("PTA")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/api/test/fees")).toEqual({ name: "PTA", amount: 5_000, term: 4, optional: true });
  });

  it("refuses an amount that isn't money before sending anything", async () => {
    const fetchMock = mockApi([["GET", "/api/test/fees", 200, []]]);
    const user = userEvent.setup();
    render(<RecordsView path="/api/test/fees" noun="fee" fields={FIELDS.slice(0, 2)} canAdd />);
    await user.click(await screen.findByRole("button", { name: "Add fee" }));
    await user.type(screen.getByLabelText(/^name/i), "PTA");
    await user.type(screen.getByLabelText(/^amount/i), "fifty");
    await user.click(screen.getByRole("button", { name: "Add fee" }));
    expect(await screen.findByText("Enter an amount in cedis, for example 150.00.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("removes a record after asking", async () => {
    mockApi([
      ["GET", "/api/test/fees", 200, [{ id: 1, name: "Tuition", amount: 100 }]],
      ["DELETE", "/api/test/fees/1", 204],
    ]);
    const user = userEvent.setup();
    render(<RecordsView path="/api/test/fees" noun="fee" fields={FIELDS.slice(0, 2)} canDelete />);
    const card = (await screen.findByText("Tuition")).closest("article") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Delete" }));
    await user.click(within(card).getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByText("Nothing here yet.")).toBeInTheDocument();
  });
});
