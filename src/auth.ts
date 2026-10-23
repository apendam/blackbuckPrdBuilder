import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { identityFromHeaders } from "@/lib/identity";

// Who is making this request. Cloudflare Access does the sign-in (see
// lib/identity.ts); this maps the verified email to a User row, creating it on
// first visit, so conversations stay tied to the same user as before.
export const auth = cache(async () => {
  const identity = await identityFromHeaders(await headers());
  if (!identity) return null;
  const user = await prisma.user.upsert({
    where: { email: identity.email },
    create: { email: identity.email, name: identity.name },
    update: {},
  });
  return { user: { id: user.id, name: user.name, email: user.email, image: user.image } };
});

// Cloudflare owns the session, so logging out means ending the Access session.
export async function signOut(_opts?: { redirectTo?: string }): Promise<never> {
  redirect("/cdn-cgi/access/logout");
}
