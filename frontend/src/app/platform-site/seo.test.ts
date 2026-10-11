import { describe, expect, it, vi } from "vitest";
import { getPlatform, getPlatformArticles } from "@/lib/api";
import type { PlatformData } from "@/lib/types";
import { GET as robots } from "./robots.txt/route";
import { GET as sitemap } from "./sitemap.xml/route";

vi.mock("@/lib/api", () => ({ getPlatform: vi.fn(), getPlatformArticles: vi.fn(async () => []) }));

const PLATFORM: PlatformData = {
  name: "SchoolSite", email: "", phone: "", phone_display: "", url: "https://schoolsite.test", is_public: false,
  schools: [], gallery: [], latest_articles: [], testimonials: [], faqs: [], whatsapp_channel: "",
};

describe("platform robots.txt and sitemap.xml", () => {
  it("keep search engines out until the platform is public", async () => {
    vi.mocked(getPlatform).mockResolvedValue(PLATFORM);
    expect(await (await robots()).text()).toBe("User-Agent: *\nDisallow: /\n");
    expect(await (await sitemap()).text()).not.toContain("<url>");
  });

  it("list the platform pages once public", async () => {
    vi.mocked(getPlatform).mockResolvedValue({ ...PLATFORM, is_public: true });
    expect(await (await robots()).text()).toContain("Sitemap: https://schoolsite.test/sitemap.xml");
    expect(await (await sitemap()).text()).toContain("<loc>https://schoolsite.test/privacy</loc>");
  });

  it("list published articles once public", async () => {
    vi.mocked(getPlatform).mockResolvedValue({ ...PLATFORM, is_public: true });
    vi.mocked(getPlatformArticles).mockResolvedValue([
      {
        slug: "collect-fees-on-time-kindly", kind: "tip", title: "Collect fees", summary: "", cover: null,
        author: "", published_at: "2026-10-11T08:00:00Z", reading_minutes: 3,
      },
    ]);
    const xml = await (await sitemap()).text();
    expect(xml).toContain("<loc>https://schoolsite.test/articles</loc>");
    expect(xml).toContain("<loc>https://schoolsite.test/articles/collect-fees-on-time-kindly</loc><lastmod>2026-10-11</lastmod>");
  });
});
