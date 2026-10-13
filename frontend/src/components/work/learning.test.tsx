import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportCardView, type ReportCard } from "./learning";

const CARD: ReportCard = {
  school: { name: "ADsmart Academy", phone: "", email: "" },
  pupil: { id: 1, name: "Ama Mensah", student_id: "2600017" },
  class: "Basic 5",
  term: "Term 1, 2026/2027",
  withheld: false,
  positions: true,
  class_size: 30,
  subjects: { Mathematics: { total: 93, grade: "A", remark: "Excellent", position: 1 } },
  average: 93,
  position: 1,
  descriptive: [],
  attendance: { days: 60, present: 55, late: 3, absent: 2, rate: 96.7 },
  remarks: { conduct: "Good", interest: "", class_teacher: "Keep it up", head_teacher: "", promotion: "", reopening_date: null },
};

describe("ReportCardView", () => {
  it("shows results, position and attendance", () => {
    render(<ReportCardView card={CARD} />);
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText(/Position 1 of 30/)).toBeInTheDocument();
    expect(screen.getByText(/present 58 of 60 days/)).toBeInTheDocument();
    expect(screen.getByText("Keep it up")).toBeInTheDocument();
  });

  it("shows only a note while the report card is held for fees", () => {
    render(<ReportCardView card={{ ...CARD, withheld: true }} />);
    expect(screen.getByText(/being held until the school fees are settled/)).toBeInTheDocument();
    expect(screen.queryByText("Mathematics")).not.toBeInTheDocument();
  });
});
