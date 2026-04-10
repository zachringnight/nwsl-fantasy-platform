import NextAuth, { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { logAuthEvent } from "@/lib/audit";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

  // Credentials provider for email/password authentication
  providers.push(
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Verify the password against Supabase Auth before returning the user
        const supabase = getSupabaseServerClient();
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

        if (authError) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    })
  );

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
    async signIn({ user, account }) {
      void logAuthEvent("sign_in", {
        userId: user.id ?? undefined,
        metadata: { provider: account?.provider ?? "credentials" },
      });

      // After OAuth sign-in, check if the user has completed onboarding
      if (account?.provider === "google" && user.id) {
        try {
          const supabase = getSupabaseServerClient();
          const { data: profile } = await supabase
            .from("fantasy_profiles")
            .select("onboarding_complete")
            .eq("user_id", user.id)
            .maybeSingle();

          if (!profile || !profile.onboarding_complete) {
            return "/onboarding";
          }
        } catch {
          // If profile check fails, allow sign-in and let client-side gate handle it
        }
      }

      return true;
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    },
  },
};

export const authHandler = NextAuth(authOptions);
