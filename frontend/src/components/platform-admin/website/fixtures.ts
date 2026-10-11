import type { AdminArticle, AdminFaq, AdminGalleryPhoto, AdminTestimonial } from "@/lib/types";

export const IMAGE = { src: "/media/a-960w.webp", srcset: "/media/a-960w.webp 960w", width: 960, height: 640, alt: "" };

export const DRAFT: AdminArticle = {
  id: 5, kind: "tip", title: "Make it easy to enquire", slug: "make-it-easy-to-enquire", summary: "",
  body: "", cover: null, cover_alt: "", author_name: "Esi Writer", status: "draft", state: "draft",
  publish_at: null, email_subscribers: false, emailed_at: null, updated_at: "2026-10-11T09:00:00Z",
};

export const PHOTO: AdminGalleryPhoto = {
  id: 1, image: { ...IMAGE, alt: "Pupils reading" }, alt_text: "Pupils reading", caption: "Reading hour",
  shows_people: false, people_permission: false, visible: true, order: 1,
};

export const COMMENT: AdminTestimonial = {
  id: 3, quote: "Parents find us easily now.", person_name: "Mrs Owusu", person_role: "Head Teacher",
  school_name: "Hope Academy", school_slug: "", photo: null, permission: true, visible: true, order: 1,
};

export const QUESTION: AdminFaq = { id: 7, question: "How long does setup take?", answer: "About a week.", visible: true, order: 1 };
