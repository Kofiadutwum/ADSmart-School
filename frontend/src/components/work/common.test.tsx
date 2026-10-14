import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart } from "./common";

describe("BarChart", () => {
  it("puts the same numbers in a table for screen readers", () => {
    render(
      <BarChart
        title="New schools per month"
        head={["Month", "Schools"]}
        rows={[
          { label: "Sep 2026", value: 2 },
          { label: "Oct 2026", value: 5 },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "New schools per month" });
    expect(table).toHaveTextContent("Oct 2026");
    expect(table).toHaveTextContent("5");
  });

  it("says when there is nothing yet", () => {
    render(<BarChart title="Collected" head={["Month", "Collected"]} rows={[]} />);
    expect(screen.getByText("Nothing yet.")).toBeInTheDocument();
  });
});
