import { z } from "zod";

/** Same codes as the backend's Enquiry.Level. */
export const LEVEL_CODES = ["creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs"] as const;

export const GH_MOBILE = /^(?:\+?233|0)[25]\d{8}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function yearsBefore(isoDay: string, years: number): string {
  return `${Number(isoDay.slice(0, 4)) - years}${isoDay.slice(4)}`;
}

/** Mirrors the server's rules for instant feedback; the server stays the authority. */
export function buildEnquirySchema(today: string) {
  const oldestBirthday = yearsBefore(today, 18);
  return z.object({
    parent_name: z.string().trim().min(2, "Enter your full name.").max(120, "Use 120 characters or fewer."),
    phone: z
      .string()
      .trim()
      .refine((value) => GH_MOBILE.test(value.replace(/[\s-]/g, "")), "Enter a Ghana mobile number, e.g. 024 123 4567."),
    email: z
      .string()
      .trim()
      .max(254, "Use 254 characters or fewer.")
      .refine((value) => value === "" || EMAIL.test(value), "Enter a valid email address, or leave it blank."),
    child_name: z.string().trim().min(2, "Enter your child's full name.").max(120, "Use 120 characters or fewer."),
    child_date_of_birth: z
      .string()
      .refine((value) => ISO_DATE.test(value), "Enter your child's date of birth.")
      .refine((value) => !ISO_DATE.test(value) || value <= today, "Date of birth can't be in the future.")
      .refine(
        (value) => !ISO_DATE.test(value) || value >= oldestBirthday,
        "Please check the date of birth: we teach children up to JHS.",
      ),
    level_wanted: z
      .string()
      .refine((value) => (LEVEL_CODES as readonly string[]).includes(value), "Choose the level you're interested in."),
    preferred_visit_date: z
      .string()
      .refine((value) => value === "" || (ISO_DATE.test(value) && value >= today), "Choose today or a later date."),
    message: z.string().max(1000, "Use 1,000 characters or fewer."),
    data_consent: z.boolean().refine((value) => value, "Please agree so we can use these details to reply to you."),
  });
}

export type EnquiryValues = z.infer<ReturnType<typeof buildEnquirySchema>>;

export const EMPTY_ENQUIRY: EnquiryValues = {
  parent_name: "",
  phone: "",
  email: "",
  child_name: "",
  child_date_of_birth: "",
  level_wanted: "",
  preferred_visit_date: "",
  message: "",
  data_consent: false,
};

export function toPayload(values: EnquiryValues, formToken: string, honeypot: string) {
  return {
    ...values,
    preferred_visit_date: values.preferred_visit_date || null,
    form_token: formToken,
    website: honeypot,
  };
}
