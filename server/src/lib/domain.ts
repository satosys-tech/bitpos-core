const RAW_DOMAIN = process.env.DOMAIN ?? "localhost:3000";

/**
 * `DOMAIN` is used in two different contexts:
 *
 *  1. The host portion of a Lightning address (LUD-16). LN addresses cannot
 *     contain a port — wallets always resolve them over HTTPS on port 443.
 *  2. The `callback` URL in the LNURL-pay response, which must be a fully
 *     qualified absolute URL.
 *
 * We keep one user-supplied env var but expose two helpers so consumers
 * cannot accidentally embed `:3000` into a Lightning address.
 */
export const DOMAIN = RAW_DOMAIN;

/**
 * How the public domain was established:
 *  - "quick"  — Cloudflare quick tunnel (trycloudflare.com). URL changes on restart.
 *  - "named"  — Cloudflare named tunnel with CLOUDFLARE_TUNNEL_TOKEN. Stable URL.
 *  - "manual" — DOMAIN set directly in env (VPS, Caddy, etc.) or fallback.
 */
export type TunnelMode = "quick" | "named" | "manual";
export const TUNNEL_MODE: TunnelMode =
  (process.env.TUNNEL_MODE as TunnelMode | undefined) ?? "manual";

function isLocalHost(host: string): boolean {
  const h = host.split(":")[0].toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

/** Host portion suitable for `handle@host` Lightning addresses (port stripped). */
export function lightningAddressHost(): string {
  return RAW_DOMAIN.replace(/:\d+$/, "");
}

/** Base URL for LNURL callbacks. `http://` for localhost, `https://` otherwise. */
export function publicBaseUrl(): string {
  const scheme = isLocalHost(RAW_DOMAIN) ? "http" : "https";
  return `${scheme}://${RAW_DOMAIN}`;
}

/** True when the domain is a real public hostname (not localhost). */
export function hasPublicDomain(): boolean {
  return !isLocalHost(RAW_DOMAIN);
}
