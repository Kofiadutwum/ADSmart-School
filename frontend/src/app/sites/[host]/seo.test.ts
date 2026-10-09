import { describe, expect, it, vi } from "vitest";
import { getNewsList, getSite } from "@/lib/api";
import { makeSite } from "@/test/site-fixture";
import { GET as robots } from "./robots.txt/route";
import { GET as sitemap } from "./sitemap.xml/route";

vi.mock("@/lib/api", () => ({ getSite: vi.fn(), getNewsList: vi.fn() }));

const context = { params: Promise.resolve({ host: "adsmart.localhost" }) };
const request = new Request("http://adsmart.localhost:3000/robots.txt");

describe("robots.txt and sitemap.xml", () => {
  it("keep search engines out while the site is in preview", async () => {
    vi.mocked(getSite).mockResolvedValue(makeSite({ is_public: false }));

    expect(await (await robots(request, context)).text()).toBe("User-Agent: *\nDisallow: /\n");
    expect(await (await sitemap(request, context)).text()).not.toContain("<url>");
  });

  it("list every page and news post at the school's own address once public", async () => {
    vi.mocked(getSite).mockResolvedValue(makeSite({ is_public: true }));
    vi.mocked(getNewsList).mockResolvedValue([
      { title: "Hi", slug: "hi", summary: "s", published_at: "2026-10-09T08:00:00+00:00", cover: null },
    ]);

    expect(await (await robots(request, context)).text()).toContain(
      "Sitemap: http://adsmart.localhost:3000/sitemap.xml",
    );
    const xml = await (await sitemap(request, context)).text();
    expect(xml).toContain("<loc>http://adsmart.localhost:3000/admissions</loc>");
    expect(xml).toContain("<loc>http://adsmart.localhost:3000/news/hi</loc>");
  });
});
