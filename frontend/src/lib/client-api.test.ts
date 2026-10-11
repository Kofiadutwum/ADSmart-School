import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  deleteJson,
  errorMessage,
  fieldErrors,
  OFFLINE_MESSAGE,
  postForm,
  postJson,
} from "./client-api";

afterEach(() => {
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("browser API client", () => {
  it("posts JSON to the same origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ status: "received" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(postJson("/api/public/enquiries", { a: 1 })).resolves.toEqual({ status: "received" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/enquiries",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ a: 1 }) }),
    );
  });

  it("sends Django's CSRF token with every change and accepts empty replies", async () => {
    document.cookie = "csrftoken=abc123; path=/";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new SyntaxError("empty"); } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteJson("/api/auth/sessions/4")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sessions/4",
      expect.objectContaining({ method: "DELETE", headers: expect.objectContaining({ "X-CSRFToken": "abc123" }) }),
    );
  });

  it("uploads forms with the CSRF token and lets the browser set the content type", async () => {
    document.cookie = "csrftoken=abc123; path=/";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 1 }) });
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append("alt_text", "Pupils reading");

    await expect(postForm("/api/platform/website/gallery", form)).resolves.toEqual({ id: 1 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(form);
    expect(init.headers).toEqual({ Accept: "application/json", "X-CSRFToken": "abc123" });
  });

  it("raises ApiRequestError carrying the error body", async () => {
    const body = { code: "validation_error", message: "Check", fields: { phone: ["Bad"] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => body }));

    const error = await postJson("/x", {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(400);
    expect((error as ApiRequestError).body).toEqual(body);
    expect(errorMessage(error)).toBe("Check");
    expect(fieldErrors(error)).toEqual({ phone: "Bad" });
  });

  it("copes with error responses that are not JSON, and with no connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError("html"); } }),
    );

    const error = (await postJson("/x", {}).catch((caught: unknown) => caught)) as ApiRequestError;

    expect(error.status).toBe(502);
    expect(error.body).toBeNull();
    expect(errorMessage(error)).toBe(OFFLINE_MESSAGE);
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe(OFFLINE_MESSAGE);
    expect(fieldErrors(new TypeError("Failed to fetch"))).toEqual({});
  });
});
