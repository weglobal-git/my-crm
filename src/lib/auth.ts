import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"
import { Adapter } from "next-auth/adapters"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      allowDangerousEmailAccountLinking: true,
    }),
    ...(process.env.NODE_ENV !== "production"
      ? [
          CredentialsProvider({
            id: "dev-credentials",
            name: "Dev Fast-Login",
            credentials: {
              email: { label: "Email", type: "text" },
            },
            async authorize(credentials) {
              if (process.env.NODE_ENV === "production") return null;
              if (!credentials?.email) return null;
              const email = credentials.email.toLowerCase().trim();
              const user = await prisma.user.findUnique({
                where: { email },
                include: { departments: true },
              });
              if (!user) return null;
              return {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                role: user.role,
              };
            },
          }),
        ]
      : []),
  ],
  pages: {
    signIn: '/',
    error: '/auth/error',
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "dev-credentials") {
        return process.env.NODE_ENV !== "production";
      }

      if (!user.email) return false;
      const email = user.email.toLowerCase();
      
      if (email === "weglobal.server@gmail.com") return true;
      
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (!existingUser) return false; // Access Denied - not whitelisted
      
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && session?.image) {
        token.picture = session.image;
      }
      
      // Check database on every request to ensure user still exists and email matches
      if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          include: { departments: true }
        });

        // If user was deleted or email was changed by admin, invalidate session
        if (!dbUser || (token.email && dbUser.email && token.email.toLowerCase() !== dbUser.email.toLowerCase())) {
          return { ...token, exp: 0, sub: undefined, error: "SessionInvalidated" };
        }

        // Sync latest role, departments, and basic info
        token.name = dbUser.name;
        token.role = dbUser.role;
        token.departments = dbUser.departments.map((d: { name: string }) => d.name);
        token.picture = dbUser.image;
      }

      if (user) {
        // Auto-promote weglobal.server@gmail.com to ADMIN if needed
        if (user.email === "weglobal.server@gmail.com") {
           await prisma.user.update({
             where: { id: user.id },
             data: { role: "ADMIN" }
           });
           token.role = "ADMIN";
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (!token.sub || token.error === "SessionInvalidated") {
        return { ...session, error: "SessionInvalidated" }; // Pass error to client to force signOut
      }

      if (session.user) {
        session.user.id = token.sub as string;
        session.user.name = token.name as string;
        session.user.role = token.role as string;
        session.user.departments = (token.departments as string[]) || [];
        session.user.image = token.picture as string | null | undefined;
      }
      return session;
    }
  }
}
