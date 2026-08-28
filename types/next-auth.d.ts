import NextAuth, { DefaultSession } from "next-auth"
import { Role } from "@prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role | string
      department: string | null
    } & DefaultSession["user"]
  }

  interface User {
    role: Role | string
    departmentId?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role | string
    department: string | null
  }
}
