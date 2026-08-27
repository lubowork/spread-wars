import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST() {
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
    // VERIFY LOGIN IS A SPREAD WARS PLAYER
    // --------------------------------------------------

    const {
      data: loggedInPlayer,
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
      !loggedInPlayer
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
      return NextResponse.json(
        {
          success: false,
          error:
            'No active week was found.',
        },
        {
          status: 404,
        }
      )
    }

    // --------------------------------------------------
    // FIND MOST RECENT NORMAL PICK
    // --------------------------------------------------

    const {
      data: lastPick,
      error: pickError,
    } = await supabase
      .from('picks')
      .select(`
        id,
        player_id,
        game_id,
        pick_number,
        team,
        spread,
        result,
        is_automatic
      `)
      .eq(
        'week_id',
        week.id
      )
      .eq(
        'is_automatic',
        false
      )
      .order(
        'pick_number',
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle()

    if (pickError) {
      throw new Error(
        pickError.message
      )
    }

    if (!lastPick) {
      return NextResponse.json(
        {
          success: false,
          error:
            'There is no normal draft pick to undo.',
        },
        {
          status: 404,
        }
      )
    }

    // --------------------------------------------------
    // ONLY PENDING PICKS MAY BE UNDONE
    // --------------------------------------------------

    if (
      lastPick.result !==
      'pending'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The last pick has already been graded and cannot be undone.',
        },
        {
          status: 409,
        }
      )
    }

    // --------------------------------------------------
    // LOAD GAME
    // --------------------------------------------------

    const {
      data: game,
      error: gameError,
    } = await supabase
      .from('games')
      .select(`
        id,
        home_team,
        away_team,
        start_time,
        completed
      `)
      .eq(
        'id',
        lastPick.game_id
      )
      .maybeSingle()

    if (gameError) {
      throw new Error(
        gameError.message
      )
    }

    if (!game) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The game attached to the last pick could not be found.',
        },
        {
          status: 404,
        }
      )
    }

    // --------------------------------------------------
    // DO NOT UNDO AFTER KICKOFF
    // --------------------------------------------------

    const kickoffTime =
      new Date(
        game.start_time
      ).getTime()

    if (
      game.completed ||
      kickoffTime <= Date.now()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This game has already started and the pick can no longer be undone.',
        },
        {
          status: 409,
        }
      )
    }

    // --------------------------------------------------
    // PICKING PLAYER
    // --------------------------------------------------

    const {
      data: pickPlayer,
      error: pickPlayerError,
    } = await supabase
      .from('players')
      .select(`
        id,
        name
      `)
      .eq(
        'id',
        lastPick.player_id
      )
      .maybeSingle()

    if (pickPlayerError) {
      throw new Error(
        pickPlayerError.message
      )
    }

    // --------------------------------------------------
    // DELETE PICK
    // --------------------------------------------------

    const {
      error: deleteError,
    } = await supabase
      .from('picks')
      .delete()
      .eq(
        'id',
        lastPick.id
      )

    if (deleteError) {
      throw new Error(
        deleteError.message
      )
    }

    return NextResponse.json({
      success: true,

      message:
        `Pick #${lastPick.pick_number} was undone. ${pickPlayer?.name ?? 'The player'} is back on the clock.`,

      undonePick: {
        id:
          lastPick.id,

        pickNumber:
          lastPick.pick_number,

        playerId:
          lastPick.player_id,

        playerName:
          pickPlayer?.name ??
          'Unknown',

        team:
          lastPick.team,

        spread:
          Number(
            lastPick.spread
          ),

        gameId:
          lastPick.game_id,

        homeTeam:
          game.home_team,

        awayTeam:
          game.away_team,

        startTime:
          game.start_time,
      },
    })
  } catch (error) {
    console.error(
      'POST /api/admin/undo-last-pick error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unable to undo the last pick.',
      },
      {
        status: 500,
      }
    )
  }
}