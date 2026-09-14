import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { getCollegeFootballOdds } from '../../../lib/odds-api'

const MONTHLY_ODDS_BUDGET = 260
const DAILY_ODDS_BUDGET = 12

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

function getEasternDateKey(
  date: Date
) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }
    )

  const parts =
    formatter.formatToParts(
      date
    )

  const year =
    parts.find(
      (part) =>
        part.type === 'year'
    )?.value

  const month =
    parts.find(
      (part) =>
        part.type === 'month'
    )?.value

  const day =
    parts.find(
      (part) =>
        part.type === 'day'
    )?.value

  if (
    !year ||
    !month ||
    !day
  ) {
    return ''
  }

  return `${year}-${month}-${day}`
}

function getRefreshIntervalMinutes(
  hoursUntilNextGame:
    number | null
) {
  // No upcoming game stored.
  // Check twice per day.
  if (
    hoursUntilNextGame ===
    null
  ) {
    return 12 * 60
  }

  // More than 72 hours away
  if (
    hoursUntilNextGame >
    72
  ) {
    return 12 * 60
  }

  // 48-72 hours away
  if (
    hoursUntilNextGame >
    48
  ) {
    return 8 * 60
  }

  // 24-48 hours away
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
    return 2 * 60
  }

  // 3-6 hours away
  if (
    hoursUntilNextGame >
    3
  ) {
    return 60
  }

  // Within 3 hours
  return 30
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
    // MONTHLY ODDS USAGE
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
    // Count successful, attempted and failed paid
    // requests. This is deliberately conservative.
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

        dailyOddsBudget:
          DAILY_ODDS_BUDGET,
      })
    }

    // --------------------------------------------------
    // DAILY ODDS BUDGET
    //
    // Prevent a busy college football slate from
    // consuming dozens of credits in a single day.
    //
    // Day boundaries use America/New_York because that
    // is the timezone used throughout Spread Wars.
    // --------------------------------------------------

    const now =
      new Date()

    const todayEastern =
      getEasternDateKey(
        now
      )

    const todaysOddsRows =
      allOddsUsageRows.filter(
        (row) => {
          if (
            !row.called_at
          ) {
            return false
          }

          return (
            getEasternDateKey(
              new Date(
                row.called_at
              )
            ) ===
            todayEastern
          )
        }
      )

    const dailyOddsCredits =
      todaysOddsRows.reduce(
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
      dailyOddsCredits >=
      DAILY_ODDS_BUDGET
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,

        reason:
          'Daily Spread Wars odds budget reached. No Odds API credit used.',

        dailyOddsCredits,

        dailyOddsBudget:
          DAILY_ODDS_BUDGET,

        monthlyOddsCredits,

        monthlyOddsBudget:
          MONTHLY_ODDS_BUDGET,
      })
    }

    // --------------------------------------------------
    // FIND NEXT UPCOMING STORED GAME
    // --------------------------------------------------

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
    // Failed attempts are ignored here.
    //
    // A failed request should never make the stored
    // odds appear fresh.
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

          dailyOddsCredits,

          dailyOddsBudget:
            DAILY_ODDS_BUDGET,

          monthlyOddsCredits,

          monthlyOddsBudget:
            MONTHLY_ODDS_BUDGET,
        })
      }
    }

    // --------------------------------------------------
    // FINAL SAFETY CHECK
    //
    // Do not allow the next request to push either
    // budget above its cap.
    // --------------------------------------------------

    if (
      dailyOddsCredits + 1 >
      DAILY_ODDS_BUDGET
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,

        reason:
          'Next odds call would exceed the daily odds budget. No Odds API credit used.',

        dailyOddsCredits,

        dailyOddsBudget:
          DAILY_ODDS_BUDGET,

        monthlyOddsCredits,

        monthlyOddsBudget:
          MONTHLY_ODDS_BUDGET,
      })
    }

    if (
      monthlyOddsCredits + 1 >
      MONTHLY_ODDS_BUDGET
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,

        reason:
          'Next odds call would exceed the monthly odds budget. No Odds API credit used.',

        dailyOddsCredits,

        dailyOddsBudget:
          DAILY_ODDS_BUDGET,

        monthlyOddsCredits,

        monthlyOddsBudget:
          MONTHLY_ODDS_BUDGET,
      })
    }

    // --------------------------------------------------
    // RECORD PAID API ATTEMPT
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

    if (
      usageInsertError
    ) {
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
      const game of
      games
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

    if (
      usageUpdateError
    ) {
      console.error(
        'Usage update error:',
        usageUpdateError
      )
    }

    const updatedDailyOddsCredits =
      dailyOddsCredits +
      1

    const updatedMonthlyOddsCredits =
      monthlyOddsCredits +
      1

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

      dailyOddsCredits:
        updatedDailyOddsCredits,

      dailyOddsBudget:
        DAILY_ODDS_BUDGET,

      estimatedDailyOddsCreditsRemaining:
        Math.max(
          0,
          DAILY_ODDS_BUDGET -
            updatedDailyOddsCredits
        ),

      monthlyOddsCredits:
        updatedMonthlyOddsCredits,

      monthlyOddsBudget:
        MONTHLY_ODDS_BUDGET,

      estimatedMonthlyOddsCreditsRemaining:
        Math.max(
          0,
          MONTHLY_ODDS_BUDGET -
            updatedMonthlyOddsCredits
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