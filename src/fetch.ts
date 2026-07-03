export type FetchErrorKind =
  | "invalid_url"
  | "dns"
  | "timeout"
  | "http_error"
  | "too_large"
  | "not_text";

export interface FetchError {
  kind: FetchErrorKind;
  message: string;
}

export type FetchResult =
  | { ok: true; status: number; headers: Headers; body: string; finalUrl: string }
  | { ok: false; error: FetchError };

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export type Fetcher = (url: string, options?: FetchOptions) => Promise<FetchResult>;

const USER_AGENT = "geo-inspector-mcp/0.1.0";

export const httpFetch: Fetcher = async (url, options = {}) => {
  const { timeoutMs = 10_000, maxBytes = 2_000_000, maxRedirects = 5 } = options;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html, text/plain, application/json, */*",
        },
      });
    } catch (err) {
      return { ok: false, error: classifyNetworkError(err, current, timeoutMs) };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (location === null) {
        return { ok: true, status: response.status, headers: response.headers, body: "", finalUrl: current };
      }
      current = new URL(location, current).toString();
      continue;
    }
    const read = await readCapped(response, maxBytes);
    if (!read.ok) return read;
    return { ok: true, status: response.status, headers: response.headers, body: read.body, finalUrl: current };
  }
  return {
    ok: false,
    error: { kind: "http_error", message: `Gave up after ${maxRedirects} redirects fetching ${url}` },
  };
};

export function isHtmlContentType(contentType: string | null): boolean {
  if (contentType === null || contentType.trim() === "") return true;
  const ct = contentType.toLowerCase();
  return ct.includes("html") || ct.includes("xml");
}

function classifyNetworkError(err: unknown, url: string, timeoutMs: number): FetchError {
  const name = err instanceof Error ? err.name : "";
  const code = (err as { cause?: { code?: string } } | null)?.cause?.code ?? "";
  if (name === "TimeoutError" || name === "AbortError") {
    return { kind: "timeout", message: `Request timed out after ${timeoutMs / 1000}s: ${url}` };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return { kind: "dns", message: `Could not resolve host: ${url}` };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { kind: "http_error", message: `Request failed for ${url}: ${message}` };
}

async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; body: string } | { ok: false; error: FetchError }> {
  const reader = response.body?.getReader();
  if (reader === undefined) return { ok: true, body: "" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return {
        ok: false,
        error: {
          kind: "too_large",
          message: `Response exceeded the ${Math.round(maxBytes / 1_000_000)} MB size limit`,
        },
      };
    }
    chunks.push(value);
  }
  return { ok: true, body: Buffer.concat(chunks).toString("utf8") };
}
