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

function normalizeTeam(value: string) {
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
    automatic.includes('penn state')
  ) {
    return actual.includes(
      'penn state'
    )
  }

  // Miami means Miami Hurricanes,
  // never Miami (OH)
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
    // --------------------------------------------------
    // AUTHORIZATION
    // --------------------------------------------------

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

    // --------------------------------------------------
    // CURRENT ACTIVE WEEK
    //
    // This now includes starts_at / ends_at so automatic
    // picks only look inside the active week's game window.
    // --------------------------------------------------

    const {
      data: week,
      error: weekError,
    } = await supabase
      .from('weeks')
      .select(`
        id,
        week_number,
        season_id,
        status,
        starts_at,
        ends_at
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
        { status: 404 }
      )
    }

    // --------------------------------------------------
    // PLAYERS
    // --------------------------------------------------

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

    // --------------------------------------------------
    // GAMES FOR ACTIVE WEEK
    //
    // If starts_at exists:
    //   start_time >= starts_at
    //
    // If ends_at exists:
    //   start_time < ends_at
    //
    // If starts_at is blank:
    //   fall back to future games only.
    // --------------------------------------------------

    let gamesQuery =
      supabase
        .from('games')
        .select(`
          id,
          home_team,
          away_team,
          start_time,
          completed
        `)
        .eq(
          'completed',
          false
        )

    if (week.starts_at) {
      gamesQuery =
        gamesQuery.gte(
          'start_time',
          week.starts_at
        )
    } else {
      gamesQuery =
        gamesQuery.gte(
          'start_time',
          new Date().toISOString()
        )
    }

    if (week.ends_at) {
      gamesQuery =
        gamesQuery.lt(
          'start_time',
          week.ends_at
        )
    }

    const {
      data: games,
      error: gamesError,
    } =
      await gamesQuery.order(
        'start_time'
      )

    if (gamesError) {
      throw new Error(
        gamesError.message
      )
    }

    let created = 0
    let refreshed = 0
    let locked = 0
    let alreadyLocked = 0
    let teamGameNotFound = 0
    let currentLineNotFound = 0
    let lockLineNotFound = 0

    // --------------------------------------------------
    // PROCESS GEOFF + GENERAL
    // --------------------------------------------------

    for (
      const automaticPlayer of
      automaticPlayers
    ) {
      const {
        player,
        pickNumber,
      } = automaticPlayer

      // ------------------------------------------------
      // FIND THIS PLAYER'S AUTO TEAM GAME
      // ------------------------------------------------

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
        teamGameNotFound++
        continue
      }

      const selectedTeam =
        matchesAutomaticTeam(
          player.automatic_team,
          game.home_team
        )
          ? game.home_team
          : game.away_team

      // ------------------------------------------------
      // EXACT LOCK TIME
      //
      // Kickoff minus exactly 60 minutes.
      // ------------------------------------------------

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

      // ------------------------------------------------
      // FIND EXISTING AUTO PICK
      // ------------------------------------------------

      const {
        data: existingPick,
        error: existingError,
      } = await supabase
        .from('picks')
        .select(`
          id,
          game_id,
          team,
          spread,
          locked_spread,
          line_locked,
          lock_time
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

      // ------------------------------------------------
      // IF ALREADY LOCKED, NEVER TOUCH IT AGAIN
      // ------------------------------------------------

      if (
        existingPick?.line_locked
      ) {
        alreadyLocked++
        continue
      }

      // ------------------------------------------------
      // BEFORE LOCK:
      // USE LATEST CURRENT DRAFTKINGS LINE
      // ------------------------------------------------

      if (!shouldLock) {
        const {
          data: currentOdds,
          error: currentOddsError,
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

        if (currentOddsError) {
          throw new Error(
            currentOddsError.message
          )
        }

        if (!currentOdds) {
          currentLineNotFound++
          continue
        }

        const currentSpread =
          Number(
            currentOdds.spread
          )

        if (
          Number.isNaN(
            currentSpread
          )
        ) {
          currentLineNotFound++
          continue
        }

        // ----------------------------------------------
        // UPDATE EXISTING UNLOCKED AUTO PICK
        // ----------------------------------------------

        if (existingPick) {
          const {
            error: updateError,
          } = await supabase
            .from('picks')
            .update({
              game_id:
                game.id,

              team:
                selectedTeam,

              spread:
                currentSpread,

              lock_time:
                lockTime.toISOString(),

              line_locked:
                false,

              locked_spread:
                null,
            })
            .eq(
              'id',
              existingPick.id
            )

          if (updateError) {
            throw new Error(
              updateError.message
            )
          }

          refreshed++
          continue
        }

        // ----------------------------------------------
        // CREATE NEW UNLOCKED AUTO PICK
        // ----------------------------------------------

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
              null,

            line_locked:
              false,

            locked_at:
              null,
          })

        if (insertError) {
          throw new Error(
            insertError.message
          )
        }

        created++
        continue
      }

      // ------------------------------------------------
      // AT / AFTER LOCK TIME
      //
      // Use the newest DraftKings snapshot whose
      // fetched_at is <= exact lock time.
      //
      // This prevents a post-cutoff line from ever
      // becoming the official locked line.
      // ------------------------------------------------

      const {
        data: lockOdds,
        error: lockOddsError,
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
        .lte(
          'fetched_at',
          lockTime.toISOString()
        )
        .order(
          'fetched_at',
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle()

      if (lockOddsError) {
        throw new Error(
          lockOddsError.message
        )
      }

      // ------------------------------------------------
      // SAFETY:
      // NEVER SUBSTITUTE A LATER LINE
      // ------------------------------------------------

      if (!lockOdds) {
        lockLineNotFound++

        console.error(
          `No DraftKings lock-time line found for ${selectedTeam} at or before ${lockTime.toISOString()}`
        )

        continue
      }

      const officialSpread =
        Number(
          lockOdds.spread
        )

      if (
        Number.isNaN(
          officialSpread
        )
      ) {
        lockLineNotFound++
        continue
      }

      // ------------------------------------------------
      // LOCK EXISTING PICK
      // ------------------------------------------------

      if (existingPick) {
        const {
          error: lockError,
        } = await supabase
          .from('picks')
          .update({
            game_id:
              game.id,

            team:
              selectedTeam,

            spread:
              officialSpread,

            locked_spread:
              officialSpread,

            line_locked:
              true,

            lock_time:
              lockTime.toISOString(),

            locked_at:
              lockTime.toISOString(),
          })
          .eq(
            'id',
            existingPick.id
          )

        if (lockError) {
          throw new Error(
            lockError.message
          )
        }

        locked++
        continue
      }

      // ------------------------------------------------
      // CREATE AUTO PICK ALREADY LOCKED
      //
      // Handles a case where the automation first sees
      // the game after the cutoff.
      // ------------------------------------------------

      const {
        error: lockedInsertError,
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
            officialSpread,

          sportsbook:
            'DraftKings',

          is_automatic:
            true,

          result:
            'pending',

          lock_time:
            lockTime.toISOString(),

          locked_spread:
            officialSpread,

          line_locked:
            true,

          locked_at:
            lockTime.toISOString(),
        })

      if (lockedInsertError) {
        throw new Error(
          lockedInsertError.message
        )
      }

      created++
      locked++
    }

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return NextResponse.json({
      success: true,

      week:
        week.week_number,

      window: {
        startsAt:
          week.starts_at,

        endsAt:
          week.ends_at,
      },

      created,
      refreshed,
      locked,
      alreadyLocked,

      warnings: {
        teamGameNotFound,
        currentLineNotFound,
        lockLineNotFound,
      },
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