import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth;
    const path = req.nextUrl.pathname;
    
    // Protect /system - only ADMIN
    if (path.startsWith("/system") && token?.role !== "ADMIN") {
       return NextResponse.redirect(new URL("/", req.url));
    }
    
    // Protect CRM pages - require ADMIN OR a valid department
    const isCrmPage = path.startsWith("/pipeline") || path.startsWith("/quotations") || path.startsWith("/contact") || path.startsWith("/customers") || path.startsWith("/sale") || path.startsWith("/marketing") || path.startsWith("/maintenance");
    if (isCrmPage) {
       const departments = token?.departments as string[] | undefined;
       if (token?.role !== "ADMIN" && (!departments || departments.length === 0)) {
           return NextResponse.redirect(new URL("/", req.url));
       }
    }
  },
  {
    pages: {
      signIn: "/",
    },
    callbacks: {
      authorized: ({ req, token }) => {
        const path = req.nextUrl.pathname;
        if (path === "/" || path.startsWith("/dashboard/overview")) {
          return true;
        }
        return !!token;
      }
    }
  }
)

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)"
  ]
}
