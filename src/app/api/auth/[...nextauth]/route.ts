import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as unknown as any, // Using unknown to satisfy strict linting before any if needed, actually NextAuth type system often needs 'any' here. Let's use `as Adapter` if we can.
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
    async jwt({ token, user }) {
      if (user) {
        // Auto-promote weglobal.server@gmail.com to ADMIN if needed
        if (user.email === "weglobal.server@gmail.com") {
           await prisma.user.update({
             where: { id: user.id },
             data: { role: "ADMIN" }
           });
        }

        // Find the user from the database to get their role and department
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: { department: true }
        })
        if (dbUser) {
          token.role = dbUser.role
          token.department = dbUser.department?.name || null
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string
        session.user.role = token.role as string
        session.user.department = token.department as string | null
      }
      return session
    }
  }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
