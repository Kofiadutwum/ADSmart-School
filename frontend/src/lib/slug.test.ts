import { describe, expect, it } from "vitest";
import { suggestSlug } from "./slug";

describe("suggestSlug", () => {
  it("turns a school's name into a web address", () => {
    expect(suggestSlug("St. Mary's Academy")).toBe("st-marys-academy");
    expect(suggestSlug("Crèche Étoile")).toBe("creche-etoile");
    expect(suggestSlug("123 Bright Future")).toBe("bright-future");
  });

  it("keeps to 30 characters without a trailing hyphen", () => {
    const slug = suggestSlug("The Very Long Name International School of Kumasi");
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith("-")).toBe(false);
  });
});
