import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadForm } from "./lead-form";

function stubApi(postStatus = 201, postBody: unknown = { status: "received" }) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? { ok: postStatus < 300, status: postStatus, json: async () => postBody }
      : { ok: true, status: 200, json: async () => ({ token: "signed-token" }) },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/school name/i), "Sunrise Academy");
  await user.type(screen.getByLabelText(/^town/i), "Ejisu");
  await user.type(screen.getByLabelText(/your name/i), "Kwame Asante");
  await user.type(screen.getByLabelText(/mobile number/i), "020 123 4567");
  await user.click(screen.getByLabelText(/I agree/i));
}

describe("LeadForm", () => {
  it("lists what is missing and moves focus to the summary", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<LeadForm platformName="SchoolSite" />);

    await user.click(screen.getByRole("button", { name: "Send request" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("School name: Enter the school's name.");
    await waitFor(() => expect(summary).toHaveFocus());
  });

  it("sends the request with its form token and says thank you", async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    render(<LeadForm platformName="SchoolSite" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByRole("heading", { name: /received your request/i })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/public/platform/leads");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      school_name: "Sunrise Academy",
      phone: "020 123 4567",
      form_token: "signed-token",
      website: "",
    });
  });

  it("shows the server's field errors", async () => {
    stubApi(400, {
      code: "validation_error",
      message: "Please check the highlighted fields.",
      fields: { phone: ["Enter a Ghana mobile number, e.g. 024 123 4567."] },
    });
    const user = userEvent.setup();
    render(<LeadForm platformName="SchoolSite" />);
    await fillIn(user);

    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findAllByText(/Enter a Ghana mobile number/)).not.toHaveLength(0);
  });
});
