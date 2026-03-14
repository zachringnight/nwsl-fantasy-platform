import NextAuth, { type AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

function buildProviders() {
  const providers = [];

  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      })
    );
  }

  return providers;
}

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
  },
  secret: process.env.AUTH_SECRET,
  providers: buildProviders(),
  pages: {
    signIn: "/login",
    newUser: "/onboarding",
    error: "/login",
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    },
  },
};

export const authHandler = NextAuth(authOptions);
