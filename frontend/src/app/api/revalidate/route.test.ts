import { revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

function call(secret: string, body: unknown) {
  return POST(
    new Request("http://127.0.0.1:3000/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Revalidate-Secret": secret },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    vi.mocked(revalidateTag).mockClear();
    vi.stubEnv("REVALIDATE_SECRET", "s3cret");
  });

  it("refreshes the platform website when Django asks with the secret", async () => {
    const response = await call("s3cret", { tag: "platform" });
    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("platform", { expire: 0 });
  });

  it("refuses a wrong secret", async () => {
    expect((await call("guess", { tag: "platform" })).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses everything when no secret is set", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "");
    expect((await call("", { tag: "platform" })).status).toBe(401);
  });

  it("refuses unknown tags", async () => {
    expect((await call("s3cret", { tag: "schools" })).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
