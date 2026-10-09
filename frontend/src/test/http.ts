import { vi } from "vitest";

export function respond(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

type Route = [method: string, path: string, status: number, body?: unknown];

/** Stubs fetch with canned responses; each route answers once, in order. Others get a 404. */
export function mockApi(routes: Route[]) {
  const queue = [...routes];
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const index = queue.findIndex(([m, p]) => m === method && p === path);
    if (index === -1) return respond(404, { code: "not_found", message: "Not found.", fields: {} });
    const [, , status, body] = queue.splice(index, 1)[0];
    return respond(status, body ?? null);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function bodyOf(fetchMock: ReturnType<typeof mockApi>, method: string, path: string): unknown {
  const call = fetchMock.mock.calls.find(([p, init]) => p === path && (init?.method ?? "GET") === method);
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}
