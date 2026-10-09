import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MapEmbed } from "./map-embed";

describe("MapEmbed", () => {
  it("loads the map only when asked, to save data", async () => {
    const user = userEvent.setup();
    render(<MapEmbed query="Kronom, Kumasi, Ghana" schoolName="AD Smart School" />);
    expect(screen.queryByTitle("Map showing AD Smart School")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show map" }));

    expect(screen.getByTitle("Map showing AD Smart School")).toHaveAttribute(
      "src",
      "https://www.google.com/maps?q=Kronom%2C%20Kumasi%2C%20Ghana&output=embed",
    );
  });
});
