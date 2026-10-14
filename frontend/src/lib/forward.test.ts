import { describe, expect, it } from "vitest";
import { backendUrl, isBackendPath, signedHeaders } from "./forward";

describe("forwarding to Django", () => {
  it("sends the API and media to Django, but answers the refresh route itself", () => {
    expect(isBackendPath("/api/auth/me")).toBe(true);
    expect(isBackendPath("/media/platform/a.webp")).toBe(true);
    expect(isBackendPath("/api/revalidate")).toBe(false);
    expect(isBackendPath("/about")).toBe(false);
    expect(isBackendPath("/apiary")).toBe(false);
  });

  it("keeps the path and query", () => {
    expect(backendUrl("https://adsmartschool-api.vercel.app/", "/api/public/platform/articles", "?kind=tip")).toBe(
      "https://adsmartschool-api.vercel.app/api/public/platform/articles?kind=tip",
    );
  });

  it("signs the visitor's address and IP when a secret is set", () => {
    const headers = signedHeaders(
      new Headers({ host: "sample.adsmartschool.com", "x-forwarded-for": "41.66.1.2, 10.0.0.1", cookie: "sessionid=x" }),
      "s3cret",
    );
    expect(headers.get("x-site-host")).toBe("sample.adsmartschool.com");
    expect(headers.get("x-site-client-ip")).toBe("41.66.1.2");
    expect(headers.get("x-proxy-secret")).toBe("s3cret");
    expect(headers.get("x-forwarded-host")).toBe("sample.adsmartschool.com");
    expect(headers.get("cookie")).toBe("sessionid=x");
  });

  it("uses x-real-ip when there is no x-forwarded-for", () => {
    expect(signedHeaders(new Headers({ host: "a.example", "x-real-ip": "41.1.1.1" }), "s").get("x-site-client-ip")).toBe(
      "41.1.1.1",
    );
  });

  it("never passes on signed headers a visitor made up", () => {
    const forged = new Headers({ host: "a.example", "x-site-host": "other.example", "x-proxy-secret": "guess" });
    const plain = signedHeaders(forged, "");
    expect(plain.get("x-site-host")).toBeNull();
    expect(plain.get("x-proxy-secret")).toBeNull();
    expect(plain.get("x-forwarded-host")).toBe("a.example");
  });

  it("passes on the daily cron's secret so the backend can check it", () => {
    const cron = new Headers({ host: "a.example", authorization: "Bearer the-cron-secret" });
    expect(signedHeaders(cron, "proxy-secret").get("authorization")).toBe("Bearer the-cron-secret");
  });
});
