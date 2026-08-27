import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  try {
    // --------------------------------------------------
    // REQUIRE LOGIN
    // --------------------------------------------------

    const authSupabase =
      await createClient()

    const {
      data: { user },
    } =
      await authSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        {
          status: 401,
        }
      )
    }

    const supabase =
      createAdminClient()

    // --------------------------------------------------
    // VERIFY SPREAD WARS PLAYER
    // --------------------------------------------------

    const {
      data: player,
      error: playerError,
    } = await supabase
      .from('players')
      .select(`
        id,
        name
      `)
      .eq(
        'auth_user_id',
        user.id
      )
      .maybeSingle()

    if (
      playerError ||
      !player
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your login is not linked to a Spread Wars player.',
        },
        {
          status: 403,
        }
      )
    }

    // --------------------------------------------------
    // READ KEY
    // --------------------------------------------------

    const apiKey =
      process.env.ODDS_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'ODDS_API_KEY is not loaded in this deployment.',
        },
        {
          status: 500,
        }
      )
    }

    // Never expose the key itself.
    const fingerprint =
      createHash('sha256')
        .update(apiKey)
        .digest('hex')
        .slice(0, 12)

    // --------------------------------------------------
    // TEST KEY AGAINST THE ODDS API
    // --------------------------------------------------

    const url =
      new URL(
        'https://api.the-odds-api.com/v4/sports'
      )

    url.searchParams.set(
      'apiKey',
      apiKey
    )

    const response =
      await fetch(
        url.toString(),
        {
          cache: 'no-store',
        }
      )

    let responseBody:
      unknown = null

    try {
      responseBody =
        await response.json()
    } catch {
      responseBody = null
    }

    return NextResponse.json({
      success:
        response.ok,

      player:
        player.name,

      keyFingerprint:
        fingerprint,

      apiStatus:
        response.status,

      requestsUsed:
        response.headers.get(
          'x-requests-used'
        ),

      requestsRemaining:
        response.headers.get(
          'x-requests-remaining'
        ),

      lastCost:
        response.headers.get(
          'x-requests-last'
        ),

      apiResponse:
        response.ok
          ? 'Key accepted'
          : responseBody,
    })
  } catch (error) {
    console.error(
      'GET /api/admin/odds-key-check error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unable to test Odds API key.',
      },
      {
        status: 500,
      }
    )
  }
}