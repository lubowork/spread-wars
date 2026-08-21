import { createServerClient } from '@supabase/ssr'
import {
  NextResponse,
  type NextRequest,
} from 'next/server'

export async function proxy(
  request: NextRequest
) {
  const pathname =
    request.nextUrl.pathname

  // --------------------------------------------------
  // CRON API ROUTES
  //
  // Supabase Cron is not a logged-in browser user.
  // These routes authenticate themselves using
  // CRON_SECRET, so let them pass through the proxy.
  // --------------------------------------------------

  const isCronRoute =
    pathname === '/api/sync' ||
    pathname === '/api/automatic-picks' ||
    pathname === '/api/results'

  if (isCronRoute) {
    return NextResponse.next()
  }

  // --------------------------------------------------
  // CREATE SUPABASE RESPONSE
  // --------------------------------------------------

  let response =
    NextResponse.next({
      request,
    })

  const supabase =
    createServerClient(
      process.env
        .NEXT_PUBLIC_SUPABASE_URL!,

      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,

      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },

          setAll(
            cookiesToSet
          ) {
            cookiesToSet.forEach(
              ({
                name,
                value,
              }) => {
                request.cookies.set(
                  name,
                  value
                )
              }
            )

            response =
              NextResponse.next({
                request,
              })

            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                response.cookies.set(
                  name,
                  value,
                  options
                )
              }
            )
          },
        },
      }
    )

  // --------------------------------------------------
  // CHECK LOGIN
  // --------------------------------------------------

  const {
    data: { user },
  } =
    await supabase.auth.getUser()

  // --------------------------------------------------
  // PUBLIC ROUTES
  // --------------------------------------------------

  const isLoginPage =
    pathname.startsWith(
      '/login'
    )

  const isAuthRoute =
    pathname.startsWith(
      '/auth'
    )

  const isPublicAsset =
    pathname.startsWith(
      '/_next'
    ) ||
    pathname ===
      '/favicon.ico' ||
    pathname ===
      '/sw.js' ||
    pathname ===
      '/manifest.webmanifest'

  // --------------------------------------------------
  // REDIRECT NON-LOGGED-IN USERS
  // --------------------------------------------------

  if (
    !user &&
    !isLoginPage &&
    !isAuthRoute &&
    !isPublicAsset
  ) {
    const url =
      request.nextUrl.clone()

    url.pathname =
      '/login'

    return NextResponse.redirect(
      url
    )
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}