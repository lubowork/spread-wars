import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { createAdminClient } from '../../../../lib/supabase-admin'

export async function POST(
  request: Request
) {
  try {
    // -----------------------------------------------
    // REQUIRE LOGIN
    // -----------------------------------------------

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

    // -----------------------------------------------
    // VERIFY USER IS GEOFF OR GENERAL
    // -----------------------------------------------

    const {
      data: player,
      error: playerError,
    } = await supabase
      .from('players')
      .select('id, name')
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

    // -----------------------------------------------
    // READ REQUEST
    // -----------------------------------------------

    const body =
      await request.json()

    const {
      weekId,
      startsAt,
      endsAt,
    } = body

    if (
      !weekId ||
      !startsAt ||
      !endsAt
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Week, start date, and end date are required.',
        },
        { status: 400 }
      )
    }

    const start =
      new Date(startsAt)

    const end =
      new Date(endsAt)

    if (
      Number.isNaN(
        start.getTime()
      ) ||
      Number.isNaN(
        end.getTime()
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid week dates.',
        },
        { status: 400 }
      )
    }

    if (
      end.getTime() <=
      start.getTime()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The week end must be after the week start.',
        },
        { status: 400 }
      )
    }

    // -----------------------------------------------
    // ONLY MODIFY ACTIVE WEEK
    // -----------------------------------------------

    const {
      data: week,
      error: weekError,
    } = await supabase
      .from('weeks')
      .select(`
        id,
        week_number,
        status
      `)
      .eq(
        'id',
        weekId
      )
      .eq(
        'status',
        'active'
      )
      .maybeSingle()

    if (weekError) {
      throw new Error(
        weekError.message
      )
    }

    if (!week) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Active week not found.',
        },
        { status: 404 }
      )
    }

    // -----------------------------------------------
    // UPDATE WINDOW
    // -----------------------------------------------

    const {
      data: updatedWeek,
      error: updateError,
    } = await supabase
      .from('weeks')
      .update({
        starts_at:
          start.toISOString(),

        ends_at:
          end.toISOString(),
      })
      .eq(
        'id',
        week.id
      )
      .select(`
        id,
        week_number,
        status,
        starts_at,
        ends_at
      `)
      .single()

    if (updateError) {
      throw new Error(
        updateError.message
      )
    }

    return NextResponse.json({
      success: true,

      message:
        `Week ${updatedWeek.week_number} window updated by ${player.name}.`,

      week:
        updatedWeek,
    })
  } catch (error) {
    console.error(
      'POST /api/admin/week-window error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unable to update week window.',
      },
      { status: 500 }
    )
  }
}