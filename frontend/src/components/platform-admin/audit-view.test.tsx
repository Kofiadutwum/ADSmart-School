import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/http";
import { AuditView, describeAction } from "./audit-view";

const ENTRIES = [
  {
    id: 2, created_at: "2026-10-10T09:00:00Z", actor_name: "Kojo Ops", action: "STATUS_CHANGED",
    entity_type: "school.school", entity_id: "1", school: "AD Smart School", reason: "Signed up",
  },
  {
    id: 1, created_at: "2026-10-10T08:00:00Z", actor_name: "", action: "SIGN_IN_FAILED",
    entity_type: "", entity_id: "", school: null, reason: "",
  },
];

describe("audit log", () => {
  it("names actions in plain words", () => {
    expect(describeAction("STATUS_CHANGED")).toBe("Status changed");
  });

  it("shows who did what, and where", async () => {
    mockApi([["GET", "/api/platform/audit", 200, ENTRIES]]);
    render(<AuditView />);
    expect(await screen.findByRole("cell", { name: "Status changed" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "AD Smart School" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Platform" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Signed up" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Not signed in" })).toBeInTheDocument();
  });
});
