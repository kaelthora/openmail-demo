import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
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