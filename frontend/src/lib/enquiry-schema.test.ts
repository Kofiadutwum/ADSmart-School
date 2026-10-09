import { describe, expect, it } from "vitest";
import { buildEnquirySchema, EMPTY_ENQUIRY, toPayload } from "./enquiry-schema";

const today = "2026-10-09";
const schema = buildEnquirySchema(today);
const valid = {
  ...EMPTY_ENQUIRY,
  parent_name: "Akua Mensah",
  phone: "024 123 4567",
  child_name: "Ama Mensah",
  child_date_of_birth: "2020-03-14",
  level_wanted: "lower_primary",
  data_consent: true,
};

function errorsFor(values: typeof valid) {
  const result = schema.safeParse(values);
  return result.success ? {} : result.error.flatten().fieldErrors;
}

describe("enquiry schema", () => {
  it("accepts a complete enquiry", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it.each(["0241234567", "024-123-4567", "+233241234567", "233 24 123 4567"])("accepts the phone %s", (phone) => {
    expect(errorsFor({ ...valid, phone }).phone).toBeUndefined();
  });

  it("rejects landlines and nonsense phone numbers", () => {
    expect(errorsFor({ ...valid, phone: "0302123456" }).phone).toBeDefined();
    expect(errorsFor({ ...valid, phone: "12345" }).phone).toBeDefined();
  });

  it("checks the date of birth", () => {
    expect(errorsFor({ ...valid, child_date_of_birth: "" }).child_date_of_birth).toEqual(["Enter your child's date of birth."]);
    expect(errorsFor({ ...valid, child_date_of_birth: "2026-10-10" }).child_date_of_birth).toEqual(["Date of birth can't be in the future."]);
    expect(errorsFor({ ...valid, child_date_of_birth: "2007-01-01" }).child_date_of_birth).toBeDefined();
  });

  it("requires consent and a level", () => {
    const errors = errorsFor({ ...valid, data_consent: false, level_wanted: "" });
    expect(errors.data_consent).toBeDefined();
    expect(errors.level_wanted).toBeDefined();
  });

  it("only allows visit dates from today", () => {
    expect(errorsFor({ ...valid, preferred_visit_date: "2026-10-08" }).preferred_visit_date).toBeDefined();
    expect(errorsFor({ ...valid, preferred_visit_date: "2026-10-09" }).preferred_visit_date).toBeUndefined();
  });

  it("sends a blank visit date as null with the token and honeypot", () => {
    expect(toPayload(valid, "tok", "")).toMatchObject({ preferred_visit_date: null, form_token: "tok", website: "" });
  });
});
