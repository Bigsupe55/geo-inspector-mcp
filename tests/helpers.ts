import type { Fetcher, FetchResult } from "../src/fetch.js";

export function stubFetcher(routes: Record<string, FetchResult>): Fetcher {
  return async (url) =>
    routes[url] ?? {
      ok: false,
      error: { kind: "dns", message: `no stub registered for ${url}` },
    };
}

export function okResponse(
  body: string,
  init?: { status?: number; headers?: Record<string, string>; finalUrl?: string },
): FetchResult {
  return {
    ok: true,
    status: init?.status ?? 200,
    headers: new Headers(init?.headers ?? {}),
    body,
    finalUrl: init?.finalUrl ?? "stub://final",
  };
}
