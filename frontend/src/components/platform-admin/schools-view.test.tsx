import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/http";
import { SchoolsView } from "./schools-view";

const ROWS = [
  {
    slug: "adsmart", name: "AD Smart School", town: "Kronom, Kumasi", region: "Ashanti Region", status: "trial",
    is_public: false, to_do: 3, created_at: "2026-10-09T23:34:00Z", url: "http://adsmart.localhost:3000",
  },
  {
    slug: "hope", name: "Hope Academy", town: "Tema", region: "Greater Accra Region", status: "active",
    is_public: true, to_do: 0, created_at: "2026-10-10T09:00:00Z", url: "http://hope.localhost:3000",
  },
];

describe("schools list", () => {
  it("lists schools with their status and go-live progress", async () => {
    mockApi([["GET", "/api/platform/schools", 200, ROWS]]);
    render(<SchoolsView />);
    const link = await screen.findByRole("link", { name: /AD Smart School/ });
    expect(link).toHaveAttribute("href", "/schools/adsmart");
    const list = screen.getByRole("list");
    expect(within(list).getByText("Preview · 3 to do")).toBeInTheDocument();
    expect(within(list).getByText("Website live")).toBeInTheDocument();
    expect(within(list).getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a school" })).toHaveAttribute("href", "/schools/new");
  });

  it("searches and filters on the server", async () => {
    const fetchMock = mockApi([
      ["GET", "/api/platform/schools", 200, ROWS],
      ["GET", "/api/platform/schools?q=hope", 200, [ROWS[1]]],
      ["GET", "/api/platform/schools?q=hope&status=active", 200, [ROWS[1]]],
    ]);
    const user = userEvent.setup();
    render(<SchoolsView />);
    await screen.findByText("AD Smart School");
    await user.type(screen.getByRole("searchbox"), "hope");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.queryByText("AD Smart School")).not.toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Status"), "active");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/platform/schools?q=hope&status=active", expect.anything()),
    );
  });
});
