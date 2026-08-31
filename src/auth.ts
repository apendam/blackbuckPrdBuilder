import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const ALLOWED_EMAIL_DOMAIN = "@blackbuck.com";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      authorization: {
        params: {
          // access_type=offline + prompt=consent guarantee a refresh_token
          // on every sign-in (Google otherwise only issues one on the very
          // first consent) -- Phase 9's Google Doc output needs to refresh
          // the access token from a background API route, not just during
          // an active browser session.
          access_type: "offline",
          prompt: "consent",
          scope:
            "openid email profile " +
            "https://www.googleapis.com/auth/documents " +
            "https://www.googleapis.com/auth/drive.file",
        },
      },
    }),
  ],
  session: { strategy: "database" },
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email || !user.email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
        return false;
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
