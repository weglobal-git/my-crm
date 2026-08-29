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
    const isCrmPage = path.startsWith("/pipeline") || path.startsWith("/quotations") || path.startsWith("/customers") || path.startsWith("/sale") || path.startsWith("/marketing") || path.startsWith("/maintenance");
    if (isCrmPage) {
       const departments = token?.departments as string[] | undefined;
       if (token?.role !== "ADMIN" && (!departments || departments.length === 0)) {
           return NextResponse.redirect(new URL("/", req.url));
       }
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token
    }
  }
)

export const config = {
  matcher: ["/system/:path*", "/pipeline/:path*", "/quotations/:path*", "/customers/:path*"]
}
