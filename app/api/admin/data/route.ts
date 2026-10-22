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
        season_id,
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
    let buyBacks: any[] = []

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

      adjustments =
        (adjustmentData ?? []).filter(
          (adjustment: any) =>
            !adjustment.reason
              ?.toUpperCase()
              .startsWith(
                'BUYBACK:'
              )
        )

      const {
        data: seasonWeeks,
        error: seasonWeeksError,
      } = await supabaseAdmin
        .from('weeks')
        .select('id')
        .eq(
          'season_id',
          week.season_id
        )

      if (seasonWeeksError) {
        throw seasonWeeksError
      }

      const seasonWeekIds =
        (seasonWeeks ?? []).map(
          (seasonWeek) =>
            seasonWeek.id
        )

      if (seasonWeekIds.length > 0) {
        const {
          data: buyBackData,
          error: buyBackError,
        } = await supabaseAdmin
          .from('result_adjustments')
          .select(`
            id,
            week_id,
            target_player_id,
            requested_by_player_id,
            wins_delta,
            reason,
            status,
            created_at
          `)
          .in(
            'week_id',
            seasonWeekIds
          )
          .eq(
            'status',
            'approved'
          )
          .ilike(
            'reason',
            'BUYBACK:%'
          )
          .gte(
            'created_at',
            '2026-10-22T15:44:12.000Z'
          )
          .order(
            'created_at',
            {
              ascending: false,
            }
          )

        if (buyBackError) {
          throw buyBackError
        }

        buyBacks =
          buyBackData ?? []
      }
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
            season_id:
              week.season_id,
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
      buyBacks,
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