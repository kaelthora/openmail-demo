import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function withCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return response
}

/**
 * No redirect from "/" to "/openmail" — the app lives only at `/openmail` after an explicit navigation.
 * "/" is served without Basic Auth so the marketing landing is visible first.
 */
/** Paths served without Basic Auth (landing + static files used by it). */
function isPublicMarketingOrAsset(pathname: string): boolean {
  if (pathname === '/') return true
  if (pathname === '/openmail-bg.png' || pathname === '/favicon.ico') return true
  if (pathname === '/openmail-notifications-sw.js') return true
  if (pathname.startsWith('/icons/')) return true
  if (pathname === '/file.svg' || pathname === '/window.svg' || pathname === '/vercel.svg')
    return true
  return false
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      return withCorsHeaders(new NextResponse(null, { status: 200 }))
    }
    return withCorsHeaders(NextResponse.next())
  }

  if (isPublicMarketingOrAsset(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  const auth = request.headers.get('authorization')

  const BASIC_AUTH_USER = 'demo'
  const BASIC_AUTH_PASS = 'openmail'

  if (auth) {
    const encoded = auth.split(' ')[1]
    const decoded = atob(encoded)
    const [user, pass] = decoded.split(':')

    if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
      return NextResponse.next()
    }
  }

  return new NextResponse('Auth required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
    },
  })
}

export const config = {
  matcher: '/:path*',
}