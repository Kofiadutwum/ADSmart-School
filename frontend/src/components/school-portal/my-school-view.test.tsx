import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PupilMe } from "@/lib/types";
import { mockApi } from "@/test/http";
import { MySchoolView } from "./my-school-view";

const ME: PupilMe = {
  student_id: "2600017",
  name: "Ama Mensah",
  first_name: "Ama",
  class: "Basic 5A",
  initials: "AM",
  has_photo: false,
  status: "ACTIVE",
  class_teacher: "Abena Owusu",
};

describe("MySchoolView", () => {
  it("shows a pupil their profile, class and class teacher", async () => {
    mockApi([["GET", "/api/student/me", 200, ME]]);
    render(<MySchoolView />);
    expect(await screen.findByRole("heading", { name: "Hello, Ama" })).toBeInTheDocument();
    expect(screen.getByText("Student ID 2600017")).toBeInTheDocument();
    expect(screen.getByText("Basic 5A")).toBeInTheDocument();
    expect(screen.getByText("Abena Owusu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /change your password/i })).toHaveAttribute("href", "/account");
  });
});
