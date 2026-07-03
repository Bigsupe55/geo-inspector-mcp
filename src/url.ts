export type UrlResult = { ok: true; url: URL } | { ok: false; message: string };

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

export function normalizeUrl(input: string): UrlResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: false, message: "URL is empty" };
  }
  const withScheme = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, message: `Not a valid URL: ${input}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      message: `Only http and https URLs are supported, got ${url.protocol.replace(":", "")}`,
    };
  }
  return { ok: true, url };
}
