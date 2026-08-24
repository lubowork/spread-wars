import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(request: Request) {
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

    const body = await request.json()

    const {
      weekId,
      startsAt,
      endsAt,
      allowLaterDayGames,
    } = body

    if (!weekId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Week ID is required.',
        },
        { status: 400 }
      )
    }

    if (!startsAt || !endsAt) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Week start and end times are required.',
        },
        { status: 400 }
      )
    }

    const startDate =
      new Date(startsAt)

    const endDate =
      new Date(endsAt)

    if (
      Number.isNaN(
        startDate.getTime()
      ) ||
      Number.isNaN(
        endDate.getTime()
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid week start or end time.',
        },
        { status: 400 }
      )
    }

    if (
      endDate.getTime() <=
      startDate.getTime()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Week end time must be after the start time.',
        },
        { status: 400 }
      )
    }

    if (
      typeof allowLaterDayGames !==
        'boolean' &&
      typeof allowLaterDayGames !==
        'undefined'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Allow Later-Day Games must be true or false.',
        },
        { status: 400 }
      )
    }

    const {
      data: activeWeek,
      error: weekError,
    } = await supabaseAdmin
      .from('weeks')
      .select(`
        id,
        week_number,
        status,
        allow_later_day_games
      `)
      .eq('id', weekId)
      .eq('status', 'active')
      .single()

    if (
      weekError ||
      !activeWeek
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Active week was not found.',
        },
        { status: 404 }
      )
    }

    const updateValues: {
      starts_at: string
      ends_at: string
      allow_later_day_games?: boolean
    } = {
      starts_at:
        startDate.toISOString(),

      ends_at:
        endDate.toISOString(),
    }

    if (
      typeof allowLaterDayGames ===
      'boolean'
    ) {
      updateValues.allow_later_day_games =
        allowLaterDayGames
    }

    const {
      data: updatedWeek,
      error: updateError,
    } = await supabaseAdmin
      .from('weeks')
      .update(updateValues)
      .eq('id', activeWeek.id)
      .select(`
        id,
        week_number,
        status,
        starts_at,
        ends_at,
        allow_later_day_games
      `)
      .single()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,

      message:
        'Week settings updated successfully.',

      week: updatedWeek,
    })
  } catch (error) {
    console.error(
      'Week settings update error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to update week settings.',
      },
      { status: 500 }
    )
  }
}