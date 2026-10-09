import type { SiteData } from "@/lib/types";

const LEVEL_CONTENT = Object.fromEntries(
  ["creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs"].flatMap((code) => [
    [`level_${code}_ages`, `Ages for ${code}`],
    [`level_${code}_summary`, `Summary for ${code}`],
    [`level_${code}_detail`, `Detail for ${code}`],
  ]),
);

export function makeSite(overrides: Partial<SiteData> = {}): SiteData {
  return {
    school: {
      name: "AD Smart School",
      motto: "",
      founded_year: 2001,
      years_since_founding: 25,
      address: "",
      town: "Kronom, Kumasi",
      region: "Ashanti Region",
      ghana_post_gps: "",
      phone: "+233545875881",
      phone_display: "054 587 5881",
      whatsapp_link: "https://wa.me/233545875881",
      email: "school@example.com",
      map_query: "Kronom, Kumasi, Ghana",
      logo: null,
      base_url: "http://adsmart.localhost:3000",
      levels_offered: ["creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs"],
    },
    brand: { light: {}, dark: {} },
    is_public: false,
    content: {
      hero_headline: "Bright beginnings, from Crèche to JHS",
      hero_subline: "Kronom, Kumasi · Since 2001",
      hero_intro: "A caring school.",
      levels_intro: "One school for every stage.",
      for_parents_intro: "Close to your child's day.",
      admissions_cta_heading: "Come and visit us",
      admissions_cta_text: "We'd love to show you around.",
      ...LEVEL_CONTENT,
    },
    facts: [{ label: "years serving Kronom", value: "25" }],
    features: [],
    photos: {},
    gallery: [],
    ...overrides,
  };
}

export const photo = (n: number) => ({
  src: `/media/p${n}-960w.webp`,
  srcset: `/media/p${n}-480w.webp 480w, /media/p${n}-960w.webp 960w`,
  width: 960,
  height: 720,
  alt: `Photo number ${n}`,
  caption: `Caption ${n}`,
  is_placeholder: true,
});
