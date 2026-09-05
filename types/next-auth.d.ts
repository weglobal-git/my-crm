import { DefaultSession } from "next-auth"
import { Role } from "@prisma/client"

declare module "next-auth" {
  interface Session {
    error?: string
    user: {
      id: string
      role: Role | string
      departments: string[]
    } & DefaultSession["user"]
  }

  interface User {
    role: Role | string
    departmentIds?: string[]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role | string
    departments?: string[]
    error?: string
  }
}
