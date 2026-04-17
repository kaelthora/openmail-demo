import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Cross-origin browser clients allowed to call `/api/*` with credentials. */
const OPENMAIL_WEB_ORIGIN = "https://openmail-demo.vercel.app";

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

function applyApiCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  if (origin !== OPENMAIL_WEB_ORIGIN) {
    return response;
  }
  response.headers.set("Access-Control-Allow-Origin", OPENMAIL_WEB_ORIGIN);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  const requested = request.headers.get("Access-Control-Request-Headers");
  if (requested) {
    response.headers.set("Access-Control-Allow-Headers", requested);
  } else {
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  }
  response.headers.set("Vary", "Origin");
  return response;
}

/**
 * No redirect from "/" to "/openmail" — the app lives only at `/openmail` after an explicit navigation.
 * "/" is served without Basic Auth so the marketing landing is visible first.
 */
/** Paths served without Basic Auth (landing + static files used by it). */
function isPublicMarketingOrAsset(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/openmail-bg.png" || pathname === "/favicon.ico") return true;
  if (pathname === "/openmail-notifications-sw.js") return true;
  if (pathname.startsWith("/icons/")) return true;
  if (pathname === "/file.svg" || pathname === "/window.svg" || pathname === "/vercel.svg")
    return true;
  return false;
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("origin");
      if (origin !== OPENMAIL_WEB_ORIGIN) {
        return new NextResponse(null, { status: 403 });
      }
      const res = new NextResponse(null, { status: 204 });
      return applyApiCors(request, res);
    }
    return applyApiCors(request, NextResponse.next());
  }

  if (isPublicMarketingOrAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");

  const BASIC_AUTH_USER = "demo";
  const BASIC_AUTH_PASS = "openmail";

  if (auth) {
    const encoded = auth.split(" ")[1];
    const decoded = atob(encoded);
    const [user, pass] = decoded.split(":");

    if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Auth required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Secure Area"',
    },
  });
}

export const config = {
  matcher: "/:path*",
};
