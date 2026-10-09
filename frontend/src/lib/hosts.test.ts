import { describe, expect, it } from "vitest";
import { hostname, publicPath, routeFor } from "./hosts";

const route = (host: string, path: string) => routeFor(host, path, "localhost");

describe("routeFor", () => {
  it.each([
    ["localhost:3000", "/", "/platform-site"],
    ["www.localhost", "/privacy", "/platform-site/privacy"],
    ["admin.localhost:3000", "/", "/platform-admin"],
    ["adsmart.localhost:3000", "/", "/sites/adsmart.localhost"],
    ["AdSmart.Localhost:3000", "/news/hello", "/sites/adsmart.localhost/news/hello"],
    ["adsmartschool.edu.gh", "/robots.txt", "/sites/adsmartschool.edu.gh/robots.txt"],
    ["adsmart.localhost", "/sitemap.xml", "/sites/adsmart.localhost/sitemap.xml"],
  ])("sends %s%s to %s", (host, path, expected) => {
    expect(route(host, path)).toBe(expected);
  });

  it.each([
    ["adsmart.localhost", "/icon.svg"],
    ["adsmart.localhost", "/unavailable"],
    ["adsmart.localhost", "/sites/adsmart.localhost/opengraph-image"],
    ["localhost", "/platform-site/opengraph-image"],
  ])("leaves %s%s alone", (host, path) => {
    expect(route(host, path)).toBeNull();
  });

  it("never shows another site's internal pages", () => {
    expect(route("adsmart.localhost", "/sites/brightfuture.localhost")).toBe("/sites/adsmart.localhost/not-found");
    expect(route("adsmart.localhost", "/sites/brightfuture.localhost/about")).toBe("/sites/adsmart.localhost/not-found");
    expect(route("adsmart.localhost", "/platform-admin")).toBe("/sites/adsmart.localhost/not-found");
    expect(route("localhost", "/sites/adsmart.localhost/admissions")).toBe("/platform-site/not-found");
  });
});

describe("publicPath and hostname", () => {
  it("strip the internal prefix and the port", () => {
    expect(publicPath("/sites/adsmart.localhost/about")).toBe("/about");
    expect(publicPath("/sites/adsmart.localhost")).toBe("/");
    expect(publicPath("/platform-site/privacy")).toBe("/privacy");
    expect(publicPath("/about")).toBe("/about");
    expect(hostname(" AdSmart.Localhost:3000 ")).toBe("adsmart.localhost");
  });
});
