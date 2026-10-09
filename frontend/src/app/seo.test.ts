import { describe, expect, it, vi } from "vitest";
import { getNewsList, getSite } from "@/lib/api";
import { makeSite } from "@/test/site-fixture";
import robots from "./robots";
import sitemap from "./sitemap";

vi.mock("@/lib/api", () => ({ getSite: vi.fn(), getNewsList: vi.fn() }));

describe("robots and sitemap", () => {
  it("keep search engines out while the site is in preview", async () => {
    vi.mocked(getSite).mockResolvedValue(makeSite({ is_public: false }));

    expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(await sitemap()).toEqual([]);
  });

  it("list every page and news post once public", async () => {
    vi.stubEnv("SITE_URL", "https://adsmartschool.test");
    vi.mocked(getSite).mockResolvedValue(makeSite({ is_public: true }));
    vi.mocked(getNewsList).mockResolvedValue([
      { title: "Hi", slug: "hi", summary: "s", published_at: "2026-10-09T08:00:00+00:00", cover: null },
    ]);

    expect(await robots()).toMatchObject({ sitemap: "https://adsmartschool.test/sitemap.xml" });
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://adsmartschool.test/admissions");
    expect(urls).toContain("https://adsmartschool.test/news/hi");
    vi.unstubAllEnvs();
  });
});
