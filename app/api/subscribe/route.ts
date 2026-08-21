import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { createAdminClient } from '../../../../lib/supabase-admin'

export async function POST(
  request: Request
) {
  try {
    // Confirm the user is logged in
    const authSupabase =
      await createClient()

    const {
      data: { user },
      error: userError,
    } =
      await authSupabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error:
            'You must be signed in.',
        },
        { status: 401 }
      )
    }

    const supabase =
      createAdminClient()

    // Find Geoff or General
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

    if (playerError) {
      throw new Error(
        playerError.message
      )
    }

    if (!player) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your login is not linked to a player.',
        },
        { status: 403 }
      )
    }

    const body =
      await request.json()

    const {
      endpoint,
      keys,
    } = body

    if (
      !endpoint ||
      !keys?.p256dh ||
      !keys?.auth
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid push subscription.',
        },
        { status: 400 }
      )
    }

    const userAgent =
      request.headers.get(
        'user-agent'
      )

    const {
      error: saveError,
    } = await supabase
      .from(
        'push_subscriptions'
      )
      .upsert(
        {
          player_id:
            player.id,

          endpoint,

          p256dh:
            keys.p256dh,

          auth:
            keys.auth,

          user_agent:
            userAgent,

          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            'endpoint',
        }
      )

    if (saveError) {
      throw new Error(
        saveError.message
      )
    }

    return NextResponse.json({
      success: true,
      player: player.name,
    })
  } catch (error) {
    console.error(
      'POST /api/push/subscribe error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to save push subscription.',
      },
      { status: 500 }
    )
  }
}