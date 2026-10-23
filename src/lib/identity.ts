import { createRemoteJWKSet, jwtVerify } from "jose";

// Sign-in is handled by Cloudflare Access in front of the app. Access puts a
// signed JWT on every request it lets through (Cf-Access-Jwt-Assertion); this
// verifies it, so a request that reaches the pod without going through
// Cloudflare (for example straight to the Service inside the cluster) cannot
// pass itself off as a user by sending a bare email header.
//
//   CF_ACCESS_TEAM_DOMAIN  e.g. yourteam.cloudflareaccess.com
//   CF_ACCESS_AUD          the Access application's Audience (AUD) tag
//
// Local development has no Cloudflare in front: set DEV_USER_EMAIL and run
// `npm run dev`. It is ignored when NODE_ENV is "production".
const ALLOWED_EMAIL_DOMAIN = "@blackbuck.com";

export interface Identity {
  email: string;
  name: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function nameFromEmail(email: string): string {
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

export async function identityFromHeaders(h: Headers): Promise<Identity | null> {
  const team = process.env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const aud = process.env.CF_ACCESS_AUD;
  let email: string | undefined;
  let name: string | undefined;

  if (team && aud) {
    const token = h.get("cf-access-jwt-assertion");
    if (!token) return null;
    try {
      jwks ??= createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
      const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud });
      email = typeof payload.email === "string" ? payload.email : undefined;
      name = typeof payload.name === "string" ? payload.name : undefined;
    } catch {
      return null;
    }
  } else if (process.env.NODE_ENV !== "production" && process.env.DEV_USER_EMAIL) {
    email = process.env.DEV_USER_EMAIL;
  }

  if (!email || !email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) return null;
  return { email: email.toLowerCase(), name: name || nameFromEmail(email) };
}
