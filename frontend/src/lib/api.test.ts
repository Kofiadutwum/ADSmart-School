import { afterEach, describe, expect, it, vi } from "vitest";
import { getNewsList, getNewsPost, getPlatform, getSite } from "./api";

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("server API client", () => {
  it("asks Django for one school's content and revalidates every five minutes", async () => {
    vi.stubEnv("DJANGO_ORIGIN", "http://django.test");
    const fetchMock = stubFetch(200, []);

    await getNewsList("adsmart.localhost", 3);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://django.test/api/public/sites/adsmart.localhost/news?limit=3",
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
  });

  it("returns null for a missing news post", async () => {
    stubFetch(404, { code: "not_found" });
    expect(await getNewsPost("adsmart.localhost", "nope")).toBeNull();
  });

  it("shows the not-found page for an unknown school", async () => {
    stubFetch(404, { code: "not_found" });
    await expect(getSite("nobody.localhost")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends visitors of a suspended school to the unavailable page", async () => {
    stubFetch(503, { code: "suspended" });
    await expect(getSite("adsmart.localhost")).rejects.toThrow("NEXT_REDIRECT /unavailable");
  });

  it("fails loudly on other errors", async () => {
    stubFetch(500, { code: "error" });
    await expect(getSite("adsmart.localhost")).rejects.toThrow("500");
  });

  it("reads the platform's details", async () => {
    vi.stubEnv("DJANGO_ORIGIN", "http://django.test");
    const fetchMock = stubFetch(200, { name: "SchoolSite" });

    expect((await getPlatform()).name).toBe("SchoolSite");
    expect(fetchMock).toHaveBeenCalledWith("http://django.test/api/public/platform", expect.anything());
  });
});
