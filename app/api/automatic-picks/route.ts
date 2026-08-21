import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

function isAuthorized(request: Request) {
  const authHeader =
    request.headers.get('authorization')

  const expected =
    `Bearer ${process.env.CRON_SECRET}`

  return (
    !!process.env.CRON_SECRET &&
    authHeader === expected
  )
}

function normalizeTeam(
  value: string
) {
  return value
    .trim()
    .toLowerCase()
}

function matchesAutomaticTeam(
  automaticTeam: string,
  actualTeam: string
) {
  const automatic =
    normalizeTeam(automaticTeam)

  const actual =
    normalizeTeam(actualTeam)

  // Penn State
  if (
    automatic.includes(
      'penn state'
    )
  ) {
    return actual.includes(
      'penn state'
    )
  }

  // Miami must mean Miami Hurricanes,
  // NOT Miami (OH)
  if (automatic === 'miami') {
    return (
      actual === 'miami' ||
      actual.includes(
        'miami hurricanes'
      )
    )
  }

  return actual.includes(
    automatic
  )
}

export async function POST(
  request: Request
) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      )
    }

    const supabase =
      createAdminClient()

    // -----------------------------------------------
    // CURRENT ACTIVE WEEK
    // -----------------------------------------------

    const {
      data: week,
      error: weekError,
    } = await supabase
      .from('weeks')
      .select(`
        id,
        week_number,
        season_id,
        status
      `)
      .eq('status', 'active')
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
      return NextResponse.json(
        {
          success: false,
          error:
            'No active week was found.',
        },
        { status: 404 }
      )
    }

    // -----------------------------------------------
    // PLAYERS
    // -----------------------------------------------

    const {
      data: players,
      error: playersError,
    } = await supabase
      .from('players')
      .select(`
        id,
        name,
        automatic_team
      `)
      .order('name')

    if (playersError) {
      throw new Error(
        playersError.message
      )
    }

    if (
      !players ||
      players.length !== 2
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Exactly two players are required.',
        },
        { status: 500 }
      )
    }

    const geoff =
      players.find(
        (player) =>
          player.name === 'Geoff'
      )

    const general =
      players.find(
        (player) =>
          player.name === 'General'
      )

    if (!geoff || !general) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Geoff and General must both exist.',
        },
        { status: 500 }
      )
    }

    const automaticPlayers = [
      {
        player: geoff,
        pickNumber: 1,
      },
      {
        player: general,
        pickNumber: 2,
      },
    ]

    // -----------------------------------------------
    // FUTURE GAMES
    // -----------------------------------------------

    const {
      data: games,
      error: gamesError,
    } = await supabase
      .from('games')
      .select(`
        id,
        home_team,
        away_team,
        start_time,
        completed
      `)
      .eq('completed', false)
      .gte(
        'start_time',
        new Date().toISOString()
      )
      .order('start_time')

    if (gamesError) {
      throw new Error(
        gamesError.message
      )
    }

    let created = 0
    let refreshed = 0
    let locked = 0
    let notFound = 0

    for (
      const automaticPlayer of
      automaticPlayers
    ) {
      const {
        player,
        pickNumber,
      } = automaticPlayer

      const game =
        (games ?? []).find(
          (candidate) =>
            matchesAutomaticTeam(
              player.automatic_team,
              candidate.home_team
            ) ||
            matchesAutomaticTeam(
              player.automatic_team,
              candidate.away_team
            )
        )

      if (!game) {
        notFound++
        continue
      }

      const selectedTeam =
        matchesAutomaticTeam(
          player.automatic_team,
          game.home_team
        )
          ? game.home_team
          : game.away_team

      // ---------------------------------------------
      // LATEST DRAFTKINGS LINE
      // ---------------------------------------------

      const {
        data: latestOdds,
        error: oddsError,
      } = await supabase
        .from('odds')
        .select(`
          spread,
          fetched_at
        `)
        .eq(
          'game_id',
          game.id
        )
        .eq(
          'team',
          selectedTeam
        )
        .eq(
          'sportsbook',
          'DraftKings'
        )
        .eq(
          'market',
          'spreads'
        )
        .order(
          'fetched_at',
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle()

      if (oddsError) {
        throw new Error(
          oddsError.message
        )
      }

      if (!latestOdds) {
        continue
      }

      const currentSpread =
        Number(
          latestOdds.spread
        )

      if (
        Number.isNaN(
          currentSpread
        )
      ) {
        continue
      }

      // Exactly one hour before kickoff
      const kickoff =
        new Date(
          game.start_time
        )

      const lockTime =
        new Date(
          kickoff.getTime() -
          60 * 60 * 1000
        )

      const shouldLock =
        Date.now() >=
        lockTime.getTime()

      // ---------------------------------------------
      // EXISTING AUTO PICK?
      // ---------------------------------------------

      const {
        data: existingPick,
        error: existingError,
      } = await supabase
        .from('picks')
        .select(`
          id,
          line_locked,
          locked_spread
        `)
        .eq(
          'week_id',
          week.id
        )
        .eq(
          'player_id',
          player.id
        )
        .eq(
          'is_automatic',
          true
        )
        .maybeSingle()

      if (existingError) {
        throw new Error(
          existingError.message
        )
      }

      // ---------------------------------------------
      // EXISTING PICK
      // ---------------------------------------------

      if (existingPick) {
        // Once locked, never change it.
        if (
          existingPick.line_locked
        ) {
          continue
        }

        const updateData:
          Record<string, unknown> =
          {
            spread:
              currentSpread,
          }

        if (shouldLock) {
          updateData.locked_spread =
            currentSpread

          updateData.line_locked =
            true

          updateData.lock_time =
            lockTime.toISOString()

          updateData.locked_at =
            new Date()
              .toISOString()
        }

        const {
          error: updateError,
        } = await supabase
          .from('picks')
          .update(
            updateData
          )
          .eq(
            'id',
            existingPick.id
          )

        if (updateError) {
          throw new Error(
            updateError.message
          )
        }

        if (shouldLock) {
          locked++
        } else {
          refreshed++
        }

        continue
      }

      // ---------------------------------------------
      // CREATE AUTO PICK
      // ---------------------------------------------

      const {
        error: insertError,
      } = await supabase
        .from('picks')
        .insert({
          week_id:
            week.id,

          player_id:
            player.id,

          game_id:
            game.id,

          pick_number:
            pickNumber,

          team:
            selectedTeam,

          spread:
            currentSpread,

          sportsbook:
            'DraftKings',

          is_automatic:
            true,

          result:
            'pending',

          lock_time:
            lockTime.toISOString(),

          locked_spread:
            shouldLock
              ? currentSpread
              : null,

          line_locked:
            shouldLock,

          locked_at:
            shouldLock
              ? new Date()
                  .toISOString()
              : null,
        })

      if (insertError) {
        throw new Error(
          insertError.message
        )
      }

      created++

      if (shouldLock) {
        locked++
      }
    }

    return NextResponse.json({
      success: true,

      week:
        week.week_number,

      created,
      refreshed,
      locked,
      notFound,
    })
  } catch (error) {
    console.error(
      'POST /api/automatic-picks error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unknown automatic pick error.',
      },
      { status: 500 }
    )
  }
}