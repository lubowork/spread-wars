import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { getCollegeFootballOdds } from '../../../lib/odds-api'

const MONTHLY_ODDS_BUDGET = 200

async function isAuthorized(
  request: Request
) {
  const authHeader =
    request.headers.get(
      'authorization'
    )

  const cronSecret =
    process.env.CRON_SECRET

  // Allow Supabase Cron
  if (
    cronSecret &&
    authHeader ===
      `Bearer ${cronSecret}`
  ) {
    return true
  }

  // Otherwise require a logged-in
  // Spread Wars player.
  const authSupabase =
    await createClient()

  const {
    data: { user },
  } =
    await authSupabase.auth.getUser()

  if (!user) {
    return false
  }

  const supabase =
    createAdminClient()

  const {
    data: player,
    error,
  } = await supabase
    .from('players')
    .select('id')
    .eq(
      'auth_user_id',
      user.id
    )
    .maybeSingle()

  if (
    error ||
    !player
  ) {
    return false
  }

  return true
}

function getMonthStart() {
  const now =
    new Date()

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      1,
      0,
      0,
      0,
      0
    )
  )
}

function getRefreshIntervalMinutes(
  hoursUntilNextGame:
    number | null
) {
  // No upcoming game stored yet.
  // Check twice per day.
  if (
    hoursUntilNextGame ===
    null
  ) {
    return 12 * 60
  }

  // More than 3 days away
  if (
    hoursUntilNextGame >
    72
  ) {
    return 12 * 60
  }

  // 2-3 days away
  if (
    hoursUntilNextGame >
    48
  ) {
    return 8 * 60
  }

  // 1-2 days away
  if (
    hoursUntilNextGame >
    24
  ) {
    return 4 * 60
  }

  // 12-24 hours away
  if (
    hoursUntilNextGame >
    12
  ) {
    return 2 * 60
  }

  // 6-12 hours away
  if (
    hoursUntilNextGame >
    6
  ) {
    return 60
  }

  // 3-6 hours away
  if (
    hoursUntilNextGame >
    3
  ) {
    return 30
  }

  // Within 3 hours
  return 15
}

function formatReason(
  hoursUntilNextGame:
    number | null,
  refreshMinutes:
    number
) {
  if (
    hoursUntilNextGame ===
    null
  ) {
    return `No upcoming stored game found. Refresh window is every ${refreshMinutes} minutes.`
  }

  return `Next kickoff is approximately ${hoursUntilNextGame.toFixed(
    1
  )} hours away. Refresh window is every ${refreshMinutes} minutes.`
}

export async function POST(
  request: Request
) {
  const supabase =
    createAdminClient()

  try {
    const authorized =
      await isAuthorized(
        request
      )

    if (!authorized) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Unauthorized',
        },
        {
          status: 401,
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
        starts_at,
        ends_at,
        status
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
        skipped: true,
        reason:
          'No active week. No Odds API credit used.',
      })
    }

    if (
      !week.starts_at ||
      !week.ends_at
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason:
          'Active week does not have a complete game window. No Odds API credit used.',
      })
    }

    // --------------------------------------------------
    // MONTHLY USAGE HISTORY
    // --------------------------------------------------

    const monthStart =
      getMonthStart()

    const {
      data: usageRows,
      error: usageError,
    } = await supabase
      .from(
        'odds_api_usage'
      )
      .select(`
        id,
        called_at,
        endpoint,
        credits,
        status
      `)
      .gte(
        'called_at',
        monthStart.toISOString()
      )
      .eq(
        'endpoint',
        'odds'
      )
      .order(
        'called_at',
        {
          ascending: false,
        }
      )

    if (usageError) {
      throw new Error(
        usageError.message
      )
    }

    const allOddsUsageRows =
      usageRows ?? []

    // --------------------------------------------------
    // MONTHLY BUDGET
    //
    // Count successful AND failed paid requests because
    // an API request may still consume quota even if it
    // ultimately fails.
    //
    // This is intentionally conservative.
    // --------------------------------------------------

    const monthlyOddsCredits =
      allOddsUsageRows.reduce(
        (
          total,
          row
        ) =>
          total +
          Number(
            row.credits ?? 0
          ),
        0
      )

    if (
      monthlyOddsCredits >=
      MONTHLY_ODDS_BUDGET
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason:
          'Monthly Spread Wars odds budget reached. No Odds API credit used.',
        monthlyOddsCredits,
        monthlyOddsBudget:
          MONTHLY_ODDS_BUDGET,
      })
    }

    // --------------------------------------------------
    // FIND NEXT UPCOMING STORED GAME
    // --------------------------------------------------

    const now =
      new Date()

    const {
      data: nextGame,
      error: nextGameError,
    } = await supabase
      .from('games')
      .select(`
        id,
        start_time,
        home_team,
        away_team
      `)
      .gte(
        'start_time',
        now.toISOString()
      )
      .gte(
        'start_time',
        week.starts_at
      )
      .lt(
        'start_time',
        week.ends_at
      )
      .eq(
        'completed',
        false
      )
      .order(
        'start_time',
        {
          ascending: true,
        }
      )
      .limit(1)
      .maybeSingle()

    if (nextGameError) {
      throw new Error(
        nextGameError.message
      )
    }

    let hoursUntilNextGame:
      | number
      | null = null

    if (nextGame) {
      hoursUntilNextGame =
        Math.max(
          0,
          (
            new Date(
              nextGame.start_time
            ).getTime() -
            now.getTime()
          ) /
            (
              1000 *
              60 *
              60
            )
        )
    }

    const refreshMinutes =
      getRefreshIntervalMinutes(
        hoursUntilNextGame
      )

    // --------------------------------------------------
    // LAST SUCCESSFUL ODDS SYNC
    //
    // IMPORTANT:
    // Failed attempts are intentionally ignored here.
    //
    // A failed sync must NEVER make the app think the
    // stored odds are fresh.
    // --------------------------------------------------

    const successfulOddsRows =
      allOddsUsageRows.filter(
        (row) =>
          row.status ===
          'succeeded'
      )

    const lastSuccessfulOddsSync =
      successfulOddsRows.length >
      0
        ? successfulOddsRows[0]
        : null

    if (
      lastSuccessfulOddsSync?.called_at
    ) {
      const lastSyncTime =
        new Date(
          lastSuccessfulOddsSync.called_at
        ).getTime()

      const minutesSinceLastSync =
        (
          now.getTime() -
          lastSyncTime
        ) /
        (
          1000 *
          60
        )

      if (
        minutesSinceLastSync <
        refreshMinutes
      ) {
        const nextEligibleAt =
          new Date(
            lastSyncTime +
              refreshMinutes *
                60 *
                1000
          )

        return NextResponse.json({
          success: true,
          skipped: true,

          reason:
            'Stored odds are fresh enough. No Odds API credit used.',

          scheduleReason:
            formatReason(
              hoursUntilNextGame,
              refreshMinutes
            ),

          minutesSinceLastSuccessfulSync:
            Math.round(
              minutesSinceLastSync
            ),

          refreshMinutes,

          lastSuccessfulSyncAt:
            new Date(
              lastSyncTime
            ).toISOString(),

          nextEligibleAt:
            nextEligibleAt.toISOString(),

          monthlyOddsCredits,

          monthlyOddsBudget:
            MONTHLY_ODDS_BUDGET,
        })
      }
    }

    // --------------------------------------------------
    // RECORD PAID API ATTEMPT
    //
    // Record before calling the API so we keep a
    // complete history even when the request fails.
    //
    // FAILED ROWS DO NOT AFFECT THE FRESHNESS COOLDOWN.
    // --------------------------------------------------

    const reason =
      formatReason(
        hoursUntilNextGame,
        refreshMinutes
      )

    const {
      data: usageRun,
      error: usageInsertError,
    } = await supabase
      .from(
        'odds_api_usage'
      )
      .insert({
        endpoint:
          'odds',

        credits:
          1,

        status:
          'attempted',

        reason,
      })
      .select('id')
      .single()

    if (usageInsertError) {
      throw new Error(
        usageInsertError.message
      )
    }

    // --------------------------------------------------
    // PAID ODDS API CALL
    // --------------------------------------------------

    let games

    try {
      games =
        await getCollegeFootballOdds()
    } catch (error) {
      await supabase
        .from(
          'odds_api_usage'
        )
        .update({
          status:
            'failed',

          error:
            error instanceof Error
              ? error.message
              : 'Unknown Odds API error',
        })
        .eq(
          'id',
          usageRun.id
        )

      throw error
    }

    const fetchedAt =
      new Date()
        .toISOString()

    let gamesSaved = 0
    let oddsSaved = 0

    // --------------------------------------------------
    // SAVE GAMES + ODDS
    // --------------------------------------------------

    for (
      const game of games
    ) {
      const {
        data: savedGame,
        error: gameError,
      } = await supabase
        .from('games')
        .upsert(
          {
            external_game_id:
              game.id,

            home_team:
              game.homeTeam,

            away_team:
              game.awayTeam,

            start_time:
              game.commenceTime,
          },
          {
            onConflict:
              'external_game_id',
          }
        )
        .select('id')
        .single()

      if (gameError) {
        console.error(
          'Game save error:',
          gameError
        )

        continue
      }

      gamesSaved++

      for (
        const spread of
        game.spreads
      ) {
        const {
          error: oddsError,
        } = await supabase
          .from('odds')
          .insert({
            game_id:
              savedGame.id,

            sportsbook:
              'DraftKings',

            market:
              'spreads',

            team:
              spread.team,

            spread:
              spread.point,

            price:
              spread.price,

            fetched_at:
              fetchedAt,
          })

        if (oddsError) {
          console.error(
            'Odds save error:',
            oddsError
          )

          continue
        }

        oddsSaved++
      }
    }

    // --------------------------------------------------
    // MARK SUCCESS
    //
    // Only this status is considered fresh for the
    // cooldown calculation on future runs.
    // --------------------------------------------------

    const {
      error: usageUpdateError,
    } = await supabase
      .from(
        'odds_api_usage'
      )
      .update({
        status:
          'succeeded',

        games_saved:
          gamesSaved,

        odds_saved:
          oddsSaved,

        error:
          null,
      })
      .eq(
        'id',
        usageRun.id
      )

    if (usageUpdateError) {
      console.error(
        'Usage update error:',
        usageUpdateError
      )
    }

    return NextResponse.json({
      success: true,
      skipped: false,

      gamesSaved,
      oddsSaved,

      refreshMinutes,

      hoursUntilNextGame:
        hoursUntilNextGame ===
        null
          ? null
          : Number(
              hoursUntilNextGame.toFixed(
                2
              )
            ),

      monthlyOddsCredits:
        monthlyOddsCredits +
        1,

      monthlyOddsBudget:
        MONTHLY_ODDS_BUDGET,

      estimatedOddsCreditsRemaining:
        MONTHLY_ODDS_BUDGET -
        (
          monthlyOddsCredits +
          1
        ),

      reason,
    })
  } catch (error) {
    console.error(
      'POST /api/sync error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unknown sync error',
      },
      {
        status: 500,
      }
    )
  }
}