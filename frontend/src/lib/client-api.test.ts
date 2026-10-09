import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, postJson } from "./client-api";

afterEach(() => vi.unstubAllGlobals());

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

  it("raises ApiRequestError carrying the error body", async () => {
    const body = { code: "validation_error", message: "Check", fields: { phone: ["Bad"] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => body }));

    const error = await postJson("/x", {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(400);
    expect((error as ApiRequestError).body).toEqual(body);
  });

  it("copes with error responses that are not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError("html"); } }),
    );

    const error = (await postJson("/x", {}).catch((caught: unknown) => caught)) as ApiRequestError;

    expect(error.status).toBe(502);
    expect(error.body).toBeNull();
  });
});
