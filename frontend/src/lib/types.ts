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
export type PlatformArticleSummary = {
  slug: string;
  kind: ArticleKind;
  title: string;
  summary: string;
  cover: ImageData | null;
  author: string;
  published_at: string;
  reading_minutes: number;
};
export type PlatformArticle = PlatformArticleSummary & { body: string; related: PlatformArticleSummary[] };
export type PlatformGalleryPhoto = { id: number; image: ImageData | null; caption: string };
export type PlatformTestimonial = {
  id: number;
  quote: string;
  name: string;
  role: string;
  school: string;
  school_url: string | null;
  photo: ImageData | null;
};
export type PlatformFaq = { id: number; question: string; answer: string };

export type PlatformData = {
  name: string;
  email: string;
  phone: string;
  phone_display: string;
  url: string;
  is_public: boolean;
  schools: PlatformSchool[];
  gallery: PlatformGalleryPhoto[];
  latest_articles: PlatformArticleSummary[];
  testimonials: PlatformTestimonial[];
  faqs: PlatformFaq[];
  whatsapp_channel: string;
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

/** The Website section of the admin area (business tools spec §5). */
export type ArticleKind = "news" | "tip";
export type ArticleState = "draft" | "scheduled" | "published";
export type AdminArticle = {
  id: number;
  kind: ArticleKind;
  title: string;
  slug: string;
  summary: string;
  body: string;
  cover: ImageData | null;
  cover_alt: string;
  author_name: string;
  status: "draft" | "published";
  state: ArticleState;
  publish_at: string | null;
  email_subscribers: boolean;
  emailed_at: string | null;
  updated_at: string;
};
export type AdminGalleryPhoto = {
  id: number;
  image: ImageData | null;
  alt_text: string;
  caption: string;
  shows_people: boolean;
  people_permission: boolean;
  visible: boolean;
  order: number;
};
export type AdminTestimonial = {
  id: number;
  quote: string;
  person_name: string;
  person_role: string;
  school_name: string;
  school_slug: string;
  photo: ImageData | null;
  permission: boolean;
  visible: boolean;
  order: number;
};
export type AdminFaq = { id: number; question: string; answer: string; visible: boolean; order: number };
export type SubscriberCounts = { confirmed: number; pending: number; unsubscribed: number };

/** GET /api/platform/team (business tools spec §2). */
export type TeamMember = {
  id: number;
  name: string;
  username: string;
  phone: string;
  email: string;
  roles: string[];
  is_active: boolean;
  last_sign_in: string | null;
};

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

/** The school portal (Stage 7): the shapes /api/school/… answers with. */
export type ChecklistItem = { key: string; label: string; done: boolean; detail: string };
export type SchoolDashboard = {
  counts: {
    students_by_level: { band: string; label: string; count: number }[];
    not_in_class: number;
    staff: number;
    classes: number;
    new_enquiries: number;
  };
  checklist: ChecklistItem[];
};
export type SchoolProfile = {
  name: string;
  slug: string;
  motto: string;
  founded_year: number | null;
  address: string;
  town: string;
  region: string;
  ghana_post_gps: string;
  phone: string;
  whatsapp: string;
  email: string;
  map_query: string;
  levels_offered: string[];
  brand_primary: string;
  brand_accent: string;
  logo: ImageData | null;
  level_choices: { code: string; name: string }[];
};
export type SchoolTerm = { id: number; number: number; name: string; start_date: string; end_date: string };
export type SchoolYear = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  terms: SchoolTerm[];
};
export type CalendarDayType = "OPEN" | "HOLIDAY" | "CLOSING" | "REOPENING";
export type CalendarDayRow = { date: string; type: CalendarDayType; note: string };
export type CalendarMonth = { month: string; days: CalendarDayRow[]; terms: SchoolTerm[] };
export type ClassTeacher = { term_id: number; term: number; staff_id: number; staff_name: string };
export type SchoolClassRow = {
  id: number;
  name: string;
  year_group: string;
  stream: string;
  band: string;
  academic_year: number;
  pupils: number;
  class_teachers: ClassTeacher[];
};
export type Choice = { id: number; name: string };
export type ClassesData = {
  year: Choice | null;
  years: (Choice & { is_current: boolean })[];
  classes: SchoolClassRow[];
  year_groups: { code: string; name: string }[];
  terms: SchoolTerm[];
  teachers: Choice[];
};
export type SubjectRow = { id: number; name: string; code: string; bands: string[]; is_learning_area: boolean };
export type TeachingRow = {
  id: number;
  staff_id: number;
  teacher: string;
  school_class_id: number;
  class: string;
  subject_id: number;
  subject: string;
  term_id: number;
  term: number;
};
export type EmploymentStatus = "ACTIVE" | "ON_LEAVE" | "LEFT";
export type StaffRow = {
  id: number;
  name: string;
  username: string;
  staff_number: string;
  roles: string[];
  phone: string;
  email: string;
  employment_status: EmploymentStatus;
  is_active: boolean;
  is_demo: boolean;
  needs_second_factor: boolean;
  second_factor_ready: boolean;
  last_sign_in: string | null;
};
export type MyClasses = {
  teaching: { id: number; class: string; class_id: number; subject: string; term: number; term_id: number }[];
  class_teacher_of: { id: number; class: string; class_id: number; term: number; term_id: number }[];
};
export type StaffDetail = StaffRow &
  MyClasses & {
    first_name: string;
    surname: string;
    qualifications: string;
    licence_number: string;
    emergency_contact: string;
  };
export type SchoolMe = MyClasses & { roles: string[]; staff: { id: number; name: string } | null };
export type SchoolAuditEntry = {
  id: number;
  created_at: string;
  actor_id: number | null;
  actor_name: string;
  action: string;
  action_label: string;
  entity_type: string;
  entity_id: string;
  reason: string;
};
export type SchoolAudit = { entries: SchoolAuditEntry[]; record_types: string[] };
