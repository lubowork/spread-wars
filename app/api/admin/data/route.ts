import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { createAdminClient } from '../../../../lib/supabase-admin'

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
        { status: 401 }
      )
    }

    const supabase =
      createAdminClient()

    // --------------------------------------------------
    // LOGGED-IN PLAYER
    // --------------------------------------------------

    const {
      data: loggedInPlayer,
      error:
        loggedInPlayerError,
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
      loggedInPlayerError
    ) {
      throw new Error(
        loggedInPlayerError.message
      )
    }

    if (!loggedInPlayer) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your login is not linked to a Spread Wars player.',
        },
        { status: 403 }
      )
    }

    // --------------------------------------------------
    // ALL PLAYERS
    // --------------------------------------------------

    const {
      data: players,
      error: playersError,
    } = await supabase
      .from('players')
      .select(`
        id,
        name
      `)
      .order('name')

    if (playersError) {
      throw new Error(
        playersError.message
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
        week_number,
        status,
        starts_at,
        ends_at
      `)
      .eq(
        'status',
        'active'
      )
      .order(
        'week_number',
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

        loggedInPlayer,

        players:
          players ?? [],

        week:
          null,

        adjustments:
          [],
      })
    }

    // --------------------------------------------------
    // ADJUSTMENTS FOR ACTIVE WEEK
    // --------------------------------------------------

    const {
      data: adjustments,
      error:
        adjustmentsError,
    } = await supabase
      .from(
        'result_adjustments'
      )
      .select(`
        id,
        target_player_id,
        requested_by_player_id,
        wins_delta,
        losses_delta,
        pushes_delta,
        reason,
        status,
        created_at
      `)
      .eq(
        'week_id',
        week.id
      )
      .order(
        'created_at',
        {
          ascending: false,
        }
      )

    if (adjustmentsError) {
      throw new Error(
        adjustmentsError.message
      )
    }

    // --------------------------------------------------
    // GET VOTES
    // --------------------------------------------------

    const adjustmentIds =
      (adjustments ?? []).map(
        (adjustment) =>
          adjustment.id
      )

    let votes: {
      adjustment_id: string
      player_id: string
      vote: string
    }[] = []

    if (
      adjustmentIds.length >
      0
    ) {
      const {
        data: voteData,
        error: voteError,
      } = await supabase
        .from(
          'adjustment_votes'
        )
        .select(`
          adjustment_id,
          player_id,
          vote
        `)
        .in(
          'adjustment_id',
          adjustmentIds
        )

      if (voteError) {
        throw new Error(
          voteError.message
        )
      }

      votes =
        voteData ?? []
    }

    // --------------------------------------------------
    // ATTACH VOTES TO EACH ADJUSTMENT
    // --------------------------------------------------

    const adjustmentsWithVotes =
      (adjustments ?? []).map(
        (adjustment) => ({
          ...adjustment,

          adjustment_votes:
            votes.filter(
              (vote) =>
                vote.adjustment_id ===
                adjustment.id
            ),
        })
      )

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return NextResponse.json({
      success: true,

      loggedInPlayer,

      players:
        players ?? [],

      week,

      adjustments:
        adjustmentsWithVotes,
    })
  } catch (error) {
    console.error(
      'GET /api/admin/data error:',
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