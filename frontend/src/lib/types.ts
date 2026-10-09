/** Shapes returned by the Django public API (backend Tasks 7–8). */

export type ImageData = { src: string; srcset: string; width: number; height: number; alt: string };

export type Photo = ImageData & { caption: string; is_placeholder: boolean };

export type SchoolInfo = {
  name: string;
  motto: string;
  founded_year: number;
  years_since_founding: number;
  address: string;
  town: string;
  region: string;
  ghana_post_gps: string;
  phone: string;
  phone_display: string;
  whatsapp_link: string;
  email: string;
  map_query: string;
};

export type Fact = { label: string; value: string };

export type FeatureIcon = "message" | "phone" | "care" | "shield";

export type Feature = { key: string; title: string; text: string; icon: FeatureIcon };

export type SiteData = {
  school: SchoolInfo;
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
