import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_ORIGIN = "https://openmail-demo.vercel.app";

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

const CORS_ALLOW_HEADERS = "Content-Type, Authorization";

function applyApiCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  if (origin !== ALLOWED_ORIGIN) {
    return response;
  }
  response.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  response.headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
  response.headers.set("Vary", "Origin");
  return response;
}

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (origin !== ALLOWED_ORIGIN) {
      return new NextResponse(null, { status: 403 });
    }
    const res = new NextResponse(null, { status: 204 });
    return applyApiCors(request, res);
  }

  return applyApiCors(request, NextResponse.next());
}

export const config = {
  matcher: "/:path*",
};
