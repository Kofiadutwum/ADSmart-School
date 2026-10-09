import { z } from "zod";
import { EMAIL, GH_MOBILE } from "./enquiry-schema";

/** Mirrors the server's rules for "Get your school online" (amendment §6). */
export const leadSchema = z.object({
  school_name: z.string().trim().min(2, "Enter the school's name.").max(120, "Use 120 characters or fewer."),
  town: z.string().trim().min(2, "Enter the school's town.").max(80, "Use 80 characters or fewer."),
  contact_name: z.string().trim().min(2, "Enter your full name.").max(120, "Use 120 characters or fewer."),
  phone: z
    .string()
    .trim()
    .refine((value) => GH_MOBILE.test(value.replace(/[\s-]/g, "")), "Enter a Ghana mobile number, e.g. 024 123 4567."),
  email: z
    .string()
    .trim()
    .max(254, "Use 254 characters or fewer.")
    .refine((value) => value === "" || EMAIL.test(value), "Enter a valid email address, or leave it blank."),
  message: z.string().max(1000, "Use 1,000 characters or fewer."),
  data_consent: z.boolean().refine((value) => value, "Please agree so we can use these details to reply to you."),
});

export type LeadValues = z.infer<typeof leadSchema>;

export const EMPTY_LEAD: LeadValues = {
  school_name: "",
  town: "",
  contact_name: "",
  phone: "",
  email: "",
  message: "",
  data_consent: false,
};
