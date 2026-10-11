import type { PlatformArticleSummary, PlatformFaq, PlatformGalleryPhoto, PlatformTestimonial } from "@/lib/types";

const IMAGE = { src: "/media/a-960w.webp", srcset: "/media/a-960w.webp 960w", width: 960, height: 640, alt: "" };

export const PHOTOS: PlatformGalleryPhoto[] = [
  { id: 1, image: { ...IMAGE, alt: "Pupils reading" }, caption: "Reading hour" },
  { id: 2, image: { ...IMAGE, alt: "Our library" }, caption: "" },
];

export const COMMENTS: PlatformTestimonial[] = [
  {
    id: 3, quote: "Parents find us easily now.", name: "Mrs Owusu", role: "Head Teacher",
    school: "Hope Academy", school_url: "https://hope.example", photo: null,
  },
];

export const ARTICLES: PlatformArticleSummary[] = [
  {
    slug: "collect-fees-on-time-kindly", kind: "tip", title: "Collect fees on time, kindly",
    summary: "Clear bills and early reminders.", cover: null, author: "Esi Writer",
    published_at: "2026-10-11T08:00:00Z", reading_minutes: 3,
  },
];

export const FAQS: PlatformFaq[] = [{ id: 7, question: "How long does setup take?", answer: "About **a week**." }];
