import { afterEach, describe, expect, it, vi } from "vitest";
import { getNewsList, getNewsPost, getSite } from "./api";

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
  it("calls Django directly and revalidates every five minutes", async () => {
    vi.stubEnv("DJANGO_ORIGIN", "http://django.test");
    const fetchMock = stubFetch(200, []);

    await getNewsList(3);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://django.test/api/public/news?limit=3",
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
  });

  it("returns null for a missing news post", async () => {
    stubFetch(404, { code: "not_found" });
    expect(await getNewsPost("nope")).toBeNull();
  });

  it("fails loudly when the site content cannot be loaded", async () => {
    stubFetch(503, { code: "not_configured" });
    await expect(getSite()).rejects.toThrow("503");
  });
});
