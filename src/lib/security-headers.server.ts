// Server-only security response headers applied to every SSR/API response.
// Frontend hardening only; real authorization always lives in server functions + RLS.

const CSP = [
  "default-src 'self'",
  // Vite/TanStack inject inline bootstrap scripts; styles are inlined by Tailwind.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.gpteng.co",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Keep the Lovable editor preview working while blocking third-party framing.
  "frame-ancestors 'self' https://*.lovable.app https://*.lovable.dev https://*.lovableproject.com https://lovable.dev",
].join("; ");

const HEADERS: Record<string, string> = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "cross-origin-opener-policy": "same-origin-allow-popups",
  // Must stay cross-origin: the Lovable preview embeds this app from another
  // origin, and "same-origin" makes Chrome reject the document with
  // ERR_BLOCKED_BY_RESPONSE when the embedder sends COEP.
  "cross-origin-resource-policy": "cross-origin",
  "x-dns-prefetch-control": "off",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

/** Adds hardening headers without clobbering anything the app set deliberately. */
export function withSecurityHeaders(response: Response, url: URL): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(HEADERS)) {
    if (name === "strict-transport-security" && url.protocol !== "https:") continue;
    if (!headers.has(name)) headers.set(name, value);
  }
  // Never advertise the runtime/framework.
  headers.delete("x-powered-by");
  headers.delete("server");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
