import type { LevelCode } from "./levels";

/** Shapes returned by the Django public API (backend Tasks 7–8). */

export type ImageData = { src: string; srcset: string; width: number; height: number; alt: string };

export type Photo = ImageData & { caption: string; is_placeholder: boolean };

export type SchoolInfo = {
  name: string;
  motto: string;
  founded_year: number | null;
  years_since_founding: number | null;
  address: string;
  town: string;
  region: string;
  ghana_post_gps: string;
  phone: string;
  phone_display: string;
  whatsapp_link: string;
  email: string;
  map_query: string;
  logo: ImageData | null;
  /** The school's primary address, e.g. https://adsmart.schoolsite.com */
  base_url: string;
  levels_offered: LevelCode[];
};

export type Fact = { label: string; value: string };

export type FeatureIcon = "message" | "phone" | "care" | "shield";

export type Feature = { key: string; title: string; text: string; icon: FeatureIcon };

/** CSS variables replacing the platform palette for one school (amendment §7.2). */
export type BrandTokens = { light: Record<string, string>; dark: Record<string, string> };

export type SiteData = {
  school: SchoolInfo;
  brand: BrandTokens;
  is_public: boolean;
  content: Record<string, string>;
  facts: Fact[];
  features: Feature[];
  photos: Record<string, Photo | null>;
  gallery: Photo[];
};

export type NewsSummary = {
  title: string;
  slug: string;
  summary: string;
  published_at: string;
  cover: ImageData | null;
};

export type NewsPost = NewsSummary & { body: string };

export type PrivacyNotice = {
  version: string;
  title: string;
  body: string;
  effective_from: string;
  is_draft: boolean;
};

export type ApiErrorBody = { code: string; message: string; fields: Record<string, string[]> };

export type PlatformSchool = { name: string; town: string; region: string; url: string };

/** GET /api/public/platform (amendment §6). */
export type PlatformData = {
  name: string;
  email: string;
  phone: string;
  phone_display: string;
  url: string;
  is_public: boolean;
  schools: PlatformSchool[];
};

export type AccountKind = "staff" | "parent" | "student" | "platform";

/** GET /api/auth/me. `school` is null for platform staff. */
export type Me = {
  id: number;
  kind: AccountKind;
  username: string;
  display_name: string;
  roles: string[];
  must_change_password: boolean;
  school: { name: string; slug: string } | null;
};

export type SignInResult =
  | { status: "signed_in"; user: Me }
  | { status: "second_factor"; email: string | null; phone: string | null };

export type SessionInfo = {
  id: number;
  device: string;
  ip_address: string | null;
  signed_in_at: string;
  last_seen: string;
  current: boolean;
};

export type SchoolStatus = "trial" | "active" | "suspended";

/** GET /api/platform/schools (amendment §5). */
export type SchoolRow = {
  slug: string;
  name: string;
  town: string;
  region: string;
  status: SchoolStatus;
  is_public: boolean;
  to_do: number;
  created_at: string;
  url: string;
};

export type Administrator = {
  id: number;
  name: string;
  username: string;
  phone: string;
  email: string;
  must_change_password: boolean;
  last_sign_in: string | null;
  is_active: boolean;
};

export type SchoolDetail = SchoolRow & {
  phone: string;
  email: string;
  levels_offered: LevelCode[];
  blockers: string[];
  counts: { pupils: number; staff: number; parents: number; enquiries: number };
  administrators: Administrator[];
};

export type OneTimePassword = { username: string; one_time_password: string };

export type LeadStatus = "new" | "contacted" | "onboarded" | "closed";

export type Lead = {
  id: number;
  school_name: string;
  contact_name: string;
  phone: string;
  email: string;
  town: string;
  message: string;
  status: LeadStatus;
  staff_notes: string;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  created_at: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  school: string | null;
  reason: string;
};
