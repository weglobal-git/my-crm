import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    error?: string;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      departments?: string[];
      departmentIds?: string[];
    } & DefaultSession['user'];
  }

  interface User {
    role?: string;
    departments?: string[];
    departmentIds?: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sub?: string;
    name?: string | null;
    email?: string | null;
    picture?: string | null;
    role?: string;
    departments?: string[];
    departmentIds?: string[];
    error?: string;
  }
}
