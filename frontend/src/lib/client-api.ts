import type { ApiErrorBody } from "./types";

export const OFFLINE_MESSAGE = "We couldn't reach the school. Check your connection and try again.";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

/** The server's plain-language message, or the offline message (spec §10). */
export function errorMessage(caught: unknown): string {
  return caught instanceof ApiRequestError && caught.body?.message ? caught.body.message : OFFLINE_MESSAGE;
}

/** The first message for each field of a validation error. */
export function fieldErrors(caught: unknown): Record<string, string> {
  const fields = caught instanceof ApiRequestError ? (caught.body?.fields ?? {}) : {};
  return Object.fromEntries(Object.entries(fields).map(([name, messages]) => [name, messages[0]]));
}

async function handle<T>(response: Response): Promise<T> {
  if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  throw new ApiRequestError(response.status, body);
}

/** Django's CSRF cookie; GET /api/auth/me hands it out. */
function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function getJson<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, { headers: { Accept: "application/json" } }));
}

async function send<T>(method: "POST" | "PATCH" | "DELETE", path: string, data?: unknown): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRFToken": csrfToken() },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  );
}

export function postJson<T>(path: string, data?: unknown): Promise<T> {
  return send<T>("POST", path, data);
}

export function deleteJson<T>(path: string): Promise<T> {
  return send<T>("DELETE", path);
}

export function patchJson<T>(path: string, data: unknown): Promise<T> {
  return send<T>("PATCH", path, data);
}
