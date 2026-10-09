import { describe, expect, it } from "vitest";
import { levelsTitle, offeredLevels } from "./levels";

describe("levels offered", () => {
  it("keeps school order and ignores unknown codes", () => {
    expect(offeredLevels(["jhs", "kg", "university"]).map((level) => level.code)).toEqual(["kg", "jhs"]);
  });

  it("titles the range of levels", () => {
    expect(levelsTitle(offeredLevels(["creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs"]))).toBe(
      "From Crèche to JHS",
    );
    expect(levelsTitle(offeredLevels(["kg"]))).toBe("Kindergarten (KG1–KG2)");
    expect(levelsTitle([])).toBe("Our levels");
  });
});
