import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"

import { Adapter } from "next-auth/adapters";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: {
    signIn: '/',
    error: '/auth/error',
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
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
      
      if (user) {
        // Auto-promote weglobal.server@gmail.com to ADMIN if needed
        if (user.email === "weglobal.server@gmail.com") {
           await prisma.user.update({
             where: { id: user.id },
             data: { role: "ADMIN" }
           });
        }

        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: { departments: true }
        })
        if (dbUser) {
          token.role = dbUser.role
          token.departments = dbUser.departments.map(d => d.name)
          token.picture = dbUser.image
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string
        session.user.role = token.role as string
        session.user.departments = (token.departments as string[]) || []
        session.user.image = token.picture as string | null | undefined
      }
      return session
    }
  }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
