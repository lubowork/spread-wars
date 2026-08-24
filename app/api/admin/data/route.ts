import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authenticated.',
        },
        { status: 401 }
      )
    }

    const {
      data: loggedInPlayer,
      error: playerError,
    } = await supabaseAdmin
      .from('players')
      .select('id, name')
      .eq('auth_user_id', user.id)
      .single()

    if (playerError || !loggedInPlayer) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your login is not linked to a Spread Wars player.',
        },
        { status: 403 }
      )
    }

    const {
      data: players,
      error: playersError,
    } = await supabaseAdmin
      .from('players')
      .select('id, name')
      .order('name')

    if (playersError) {
      throw playersError
    }

    const {
      data: week,
      error: weekError,
    } = await supabaseAdmin
      .from('weeks')
      .select(`
        id,
        week_number,
        status,
        starts_at,
        ends_at,
        allow_later_day_games
      `)
      .eq('status', 'active')
      .order('week_number', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle()

    if (weekError) {
      throw weekError
    }

    let adjustments: any[] = []

    if (week) {
      const {
        data: adjustmentData,
        error: adjustmentsError,
      } = await supabaseAdmin
        .from('result_adjustments')
        .select(`
          id,
          target_player_id,
          requested_by_player_id,
          wins_delta,
          losses_delta,
          pushes_delta,
          reason,
          status,
          created_at,
          adjustment_votes (
            player_id,
            vote,
            voted_at
          )
        `)
        .eq('week_id', week.id)
        .order('created_at', {
          ascending: false,
        })

      if (adjustmentsError) {
        throw adjustmentsError
      }

      adjustments = adjustmentData ?? []
    }

    return NextResponse.json({
      success: true,

      loggedInPlayer: {
        id: loggedInPlayer.id,
        name: loggedInPlayer.name,
      },

      players: players ?? [],

      week: week
        ? {
            id: week.id,
            week_number:
              week.week_number,
            status:
              week.status,
            starts_at:
              week.starts_at,
            ends_at:
              week.ends_at,
            allow_later_day_games:
              week.allow_later_day_games ??
              false,
          }
        : null,

      adjustments,
    })
  } catch (error) {
    console.error(
      'Admin data error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load admin data.',
      },
      { status: 500 }
    )
  }
}