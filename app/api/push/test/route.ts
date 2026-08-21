import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '../../../../lib/supabase-server'
import { createAdminClient } from '../../../../lib/supabase-admin'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST() {
  try {
    const authSupabase =
      await createClient()

    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'You must be signed in.',
        },
        { status: 401 }
      )
    }

    const supabase =
      createAdminClient()

    const {
      data: player,
      error: playerError,
    } = await supabase
      .from('players')
      .select('id, name')
      .eq('auth_user_id', user.id)
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

    const {
      data: subscriptions,
      error: subscriptionError,
    } = await supabase
      .from('push_subscriptions')
      .select(`
        id,
        endpoint,
        p256dh,
        auth
      `)
      .eq('player_id', player.id)

    if (subscriptionError) {
      throw new Error(
        subscriptionError.message
      )
    }

    if (
      !subscriptions ||
      subscriptions.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No push subscription was found. Enable notifications first.',
        },
        { status: 400 }
      )
    }

    const payload =
      JSON.stringify({
        title: 'Spread Wars',
        body: `Test notification for ${player.name}. Push notifications are working.`,
        url: '/',
      })

    let sent = 0
    let failed = 0

    for (
      const subscription of
      subscriptions
    ) {
      try {
        await webpush.sendNotification(
          {
            endpoint:
              subscription.endpoint,

            keys: {
              p256dh:
                subscription.p256dh,

              auth:
                subscription.auth,
            },
          },
          payload
        )

        sent++
      } catch (error: any) {
        failed++

        console.error(
          'Push failed:',
          error
        )

        if (
          error?.statusCode === 404 ||
          error?.statusCode === 410
        ) {
          await supabase
            .from(
              'push_subscriptions'
            )
            .delete()
            .eq(
              'id',
              subscription.id
            )
        }
      }
    }

    if (sent === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The push notification could not be delivered.',
          failed,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
    })
  } catch (error) {
    console.error(
      'POST /api/push/test error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to send test notification.',
      },
      { status: 500 }
    )
  }
}