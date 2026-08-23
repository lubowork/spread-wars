import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createAdminClient } from '../../../lib/supabase-admin'

export async function GET() {
  try {
    // --------------------------------------------------
    // REQUIRE LOGIN
    // --------------------------------------------------

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
        {
          status: 401,
        }
      )
    }

    const supabase =
      createAdminClient()

    // --------------------------------------------------
    // REQUIRE LINKED SPREAD WARS PLAYER
    // --------------------------------------------------

    const {
      data: player,
      error: playerError,
    } = await supabase
      .from('players')
      .select('id')
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
            'Your login is not linked to a Spread Wars player.',
        },
        {
          status: 403,
        }
      )
    }

    // --------------------------------------------------
    // ACTIVE WEEK
    // --------------------------------------------------

    const {
      data: week,
      error: weekError,
    } = await supabase
      .from('weeks')
      .select(`
        id,
        week_number
      `)
      .eq(
        'status',
        'active'
      )
      .order(
        'created_at',
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle()

    if (weekError) {
      throw new Error(
        weekError.message
      )
    }

    if (!week) {
      return NextResponse.json({
        success: true,
        weekId: null,
        weekNumber: null,
        pickCount: 0,
      })
    }

    // --------------------------------------------------
    // PICK COUNT
    // --------------------------------------------------

    const {
      count,
      error: countError,
    } = await supabase
      .from('picks')
      .select(
        'id',
        {
          count: 'exact',
          head: true,
        }
      )
      .eq(
        'week_id',
        week.id
      )

    if (countError) {
      throw new Error(
        countError.message
      )
    }

    return NextResponse.json({
      success: true,
      weekId:
        week.id,
      weekNumber:
        week.week_number,
      pickCount:
        count ?? 0,
    })
  } catch (error) {
    console.error(
      'GET /api/draft-state error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load draft state.',
      },
      {
        status: 500,
      }
    )
  }
}