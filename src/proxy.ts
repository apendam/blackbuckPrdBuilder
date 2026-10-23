import { NextResponse, type NextRequest } from "next/server";
import { identityFromHeaders } from "@/lib/identity";

// Cloudflare Access already blocks anonymous users at the edge. This is the
// second check inside the app: a request without a valid Access token (or from
// outside @blackbuck.com) never reaches a page or API route.
export async function proxy(req: NextRequest) {
  if (await identityFromHeaders(req.headers)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/signin";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!signin|_next/static|_next/image|favicon.ico|.*\\.(?:webp|png|svg|ico)$).*)"],
};
