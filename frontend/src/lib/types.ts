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
export type PlatformData = { name: string; email: string; url: string; is_public: boolean; schools: PlatformSchool[] };

export type AccountKind = "staff" | "parent" | "student" | "platform";

/** GET /api/auth/me. `school` is null for platform staff. */
export type Me = {
  id: number;
  kind: AccountKind;
  username: string;
  display_name: string;
  roles: string[];
  must_change_password: boolean;
  has_authenticator: boolean;
  school: { name: string; slug: string } | null;
};

export type SignInResult =
  | { status: "signed_in"; user: Me }
  | { status: "second_factor"; totp_ready: boolean; sms_available: boolean };

export type SessionInfo = {
  id: number;
  device: string;
  ip_address: string | null;
  signed_in_at: string;
  last_seen: string;
  current: boolean;
};
