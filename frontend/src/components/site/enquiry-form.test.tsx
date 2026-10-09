import { fireEvent, render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEVEL_CODES } from "@/lib/enquiry-schema";
import { EnquiryForm } from "./enquiry-form";

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const json = (status: number, body: unknown): Reply => ({ ok: status < 400, status, json: async () => body });

function mockApi({ token = "tok" as string | null, reply = json(201, { status: "received" }) } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/form-token")) {
      if (token === null) throw new TypeError("Failed to fetch");
      return json(200, { token });
    }
    return reply;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function fillValidForm(user: UserEvent) {
  await user.type(screen.getByLabelText(/your name/i), "Akua Mensah");
  await user.type(screen.getByLabelText(/mobile number/i), "024 123 4567");
  await user.type(screen.getByLabelText(/child's name/i), "Ama Mensah");
  fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: "2019-05-01" } });
  await user.selectOptions(screen.getByLabelText(/^level/i), "lower_primary");
  await user.click(screen.getByLabelText(/I agree/i));
}

afterEach(() => vi.unstubAllGlobals());

describe("EnquiryForm", () => {
  it("shows field errors and focuses the summary when submitted empty", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<EnquiryForm schoolName="AD Smart School" schoolPhone="054 587 5881" levels={LEVEL_CODES} />);

    await user.click(screen.getByRole("button", { name: "Send enquiry" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Please check the form");
    await vi.waitFor(() => expect(summary).toHaveFocus());
    expect(screen.getAllByText("Enter your full name.").length).toBeGreaterThan(0);
  });

  it("sends a valid enquiry and confirms it", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<EnquiryForm schoolName="AD Smart School" schoolPhone="054 587 5881" levels={LEVEL_CODES} />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Send enquiry" }));

    const heading = await screen.findByRole("heading", { name: /we've received your enquiry/i });
    await vi.waitFor(() => expect(heading).toHaveFocus());
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      parent_name: "Akua Mensah",
      level_wanted: "lower_primary",
      preferred_visit_date: null,
      form_token: "tok",
      website: "",
    });
  });

  it("shows server field errors next to the field", async () => {
    mockApi({
      reply: json(400, { code: "validation_error", message: "Check", fields: { phone: ["Enter a Ghana mobile number, e.g. 024 123 4567."] } }),
    });
    const user = userEvent.setup();
    render(<EnquiryForm schoolName="AD Smart School" schoolPhone="054 587 5881" levels={LEVEL_CODES} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(await screen.findAllByText("Enter a Ghana mobile number, e.g. 024 123 4567.")).not.toHaveLength(0);
    expect(screen.getByLabelText(/mobile number/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a helpful message when the form token cannot be loaded", async () => {
    mockApi({ token: null });
    render(<EnquiryForm schoolName="AD Smart School" schoolPhone="054 587 5881" levels={LEVEL_CODES} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("054 587 5881");
  });

  it("offers only the levels the school teaches", () => {
    render(<EnquiryForm schoolName="Bright Future Academy" schoolPhone="020 123 4567" levels={["kg", "jhs"]} />);
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Choose a level", "Kindergarten (KG1–KG2)", "Junior High School (JHS 1–3)"]);
    expect(screen.getByText(/Bright Future Academy may use these details/)).toBeInTheDocument();
  });
});
