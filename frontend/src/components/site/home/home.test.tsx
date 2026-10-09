import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CardRail } from "@/components/site/card-rail";
import { makeSite, photo } from "@/test/site-fixture";
import { ForParents } from "./for-parents";
import { Hero } from "./hero";
import { LevelsSection } from "./levels-section";

describe("Hero", () => {
  it("falls back to the brand gradient when there is no hero photo", () => {
    render(<Hero site={makeSite()} />);
    expect(screen.getByTestId("hero-fallback")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bright beginnings");
    expect(screen.getByRole("link", { name: "Apply for admission" })).toHaveAttribute("href", "/admissions#enquiry");
  });

  it("loads the hero photo eagerly", () => {
    render(<Hero site={makeSite({ photos: { hero: photo(1) } })} />);
    expect(screen.getByRole("img", { name: "Photo number 1" })).toHaveAttribute("loading", "eager");
  });
});

describe("ForParents", () => {
  it("renders nothing without features", () => {
    const { container } = render(<ForParents site={makeSite()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the enabled features", () => {
    const features = [{ key: "sms", title: "Updates by SMS", text: "On any phone.", icon: "message" as const }];
    render(<ForParents site={makeSite({ features })} />);
    expect(screen.getByRole("heading", { name: "Updates by SMS" })).toBeInTheDocument();
  });
});

describe("LevelsSection", () => {
  it("shows all six levels with their category in words", () => {
    render(<LevelsSection site={makeSite()} />);
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getAllByText("Early Years")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /More about JHS/ })).toHaveAttribute("href", "/levels#jhs");
  });

  it("shows only the levels the school teaches", () => {
    const site = makeSite();
    render(<LevelsSection site={{ ...site, school: { ...site.school, levels_offered: ["kg", "lower_primary"] } }} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("The levels we teach");
  });
});

describe("CardRail", () => {
  it("offers buttons as an alternative to swiping", async () => {
    const user = userEvent.setup();
    render(
      <CardRail label="School levels">
        <p>One</p>
        <p>Two</p>
      </CardRail>,
    );
    await user.click(screen.getByRole("button", { name: "Scroll School levels forward" }));
    expect(Element.prototype.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });
});
