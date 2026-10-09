import { describe, expect, it } from "vitest";
import { EMPTY_LEAD, leadSchema } from "./lead-schema";

const VALID = {
  ...EMPTY_LEAD,
  school_name: "Sunrise Academy",
  contact_name: "Kwame Asante",
  phone: "020 123 4567",
  town: "Ejisu",
  data_consent: true,
};

describe("lead schema", () => {
  it("accepts a complete request", () => {
    expect(leadSchema.safeParse(VALID).success).toBe(true);
  });

  it.each([
    ["school_name", "", "Enter the school's name."],
    ["phone", "0302123456", "Enter a Ghana mobile number, e.g. 024 123 4567."],
    ["email", "nope", "Enter a valid email address, or leave it blank."],
    ["data_consent", false, "Please agree so we can use these details to reply to you."],
  ])("explains a bad %s", (field, value, message) => {
    const result = leadSchema.safeParse({ ...VALID, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });
});
