import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { getCollegeFootballOdds } from '../../../lib/odds-api'

const MONTHLY_ODDS_BUDGET = 300
const DAILY_ODDS_BUDGET = 12

const AUTOMATIC_WAKE_HOURS_BEFORE_KICKOFF = 12

type AuthorizationResult = {
  authorized: boolean
  isCron: boolean
}

async function authorizeRequest(
  request: Request
): Promise<AuthorizationResult> {
  const authHeader =
    request.headers.get(
      'authorization'
    )

  const cronSecret =
    process.env.CRON_SECRET

  // --------------------------------------------------
  // SUPABASE CRON
  // --------------------------------------------------

  if (
    cronSecret &&
    authHeader ===
      `Bearer ${cronSecret}`
  ) {
    return {
      authorized: true,
      isCron: true,
    }
  }

  // --------------------------------------------------
  // LOGGED-IN SPREAD WARS PLAYER
  // --------------------------------------------------

  const authSupabase =
    await createClient()

  const {
    data: { user },
  } =
    await authSupabase.auth.getUser()

  if (!user) {
    return {
      authorized: false,
      isCron: false,
    }
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
    return {
      authorized: false,
      isCron: false,
    }
  }

  return {
    authorized: true,
    isCron: false,
  }
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

function getAutomaticRefreshMinutes(
  hoursUntilNextGame: number
) {
  // 6-12 hours before kickoff
  if (
    hoursUntilNextGame > 6
  ) {
    return 2 * 60
  }

  // 3-6 hours before kickoff
  if (
    hoursUntilNextGame > 3
  ) {
    return 60
  }

  // Within 3 hours
  return 30
}

function formatAutomaticReason(
  hoursUntilNextGame: number,
  refreshMinutes: number
) {
  return `Next kickoff is approximately ${hoursUntilNextGame.toFixed(
    1
  )} hours away. Automatic refresh window is every ${refreshMinutes} minutes.`
}

async function hasSuccessfulDiscovery(
  reason: string
) {
  const supabase =
    createAdminClient()

  const {
    data,
    error,
  } = await supabase
    .from('odds_api_usage')
    .select('id')
    .eq(
      'endpoint',
      'odds'
    )
    .eq(
      'status',
      'succeeded'
    )
    .eq(
      'reason',
      reason
    )
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(
      error.message
    )
  }

  return Boolean(data)
}

export async function POST(
  request: Request
) {
  const supabase =
    createAdminClient()

  try {
    // --------------------------------------------------
    // AUTHORIZATION
    // --------------------------------------------------

    const {
      authorized,
      isCron,
    } =
      await authorizeRequest(
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

    const now =
      new Date()

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
        status,
        reason
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
    // DAILY ODDS USAGE
    // --------------------------------------------------

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
    // FIND ACTIVE WEEK
    // --------------------------------------------------

    const {
      data: activeWeek,
      error: activeWeekError,
    } = await supabase
      .from('weeks')
      .select(`
        id,
        starts_at,
        ends_at,
        status,
        created_at
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

    if (activeWeekError) {
      throw new Error(
        activeWeekError.message
      )
    }

    let reason =
      ''

    let refreshMinutes:
      number | null = null

    let hoursUntilNextGame:
      number | null = null

    // --------------------------------------------------
    // NO ACTIVE WEEK
    //
    // Automatic Cron is allowed ONE discovery request
    // for the most recently created week.
    //
    // After that, Cron sleeps until another week becomes
    // active or a new week record is created.
    //
    // Manual Admin Sync Odds can still force a request.
    // --------------------------------------------------

    if (!activeWeek) {
      if (!isCron) {
        reason =
          'Manual odds sync while no week is active.'
      } else {
        const {
          data: latestWeek,
          error: latestWeekError,
        } = await supabase
          .from('weeks')
          .select(`
            id,
            status,
            created_at
          `)
          .order(
            'created_at',
            {
              ascending: false,
            }
          )
          .limit(1)
          .maybeSingle()

        if (latestWeekError) {
          throw new Error(
            latestWeekError.message
          )
        }

        if (!latestWeek) {
          return NextResponse.json({
            success: true,
            skipped: true,

            reason:
              'No week exists yet. No Odds API credit used.',

            dailyOddsCredits,

            dailyOddsBudget:
              DAILY_ODDS_BUDGET,

            monthlyOddsCredits,

            monthlyOddsBudget:
              MONTHLY_ODDS_BUDGET,
          })
        }

        const discoveryReason =
          `Idle-week discovery for week ${latestWeek.id}.`

        const discoveryAlreadySucceeded =
          await hasSuccessfulDiscovery(
            discoveryReason
          )

        if (
          discoveryAlreadySucceeded
        ) {
          return NextResponse.json({
            success: true,
            skipped: true,

            reason:
              'No active week. The one-time discovery sync has already completed. No Odds API credit used.',

            discoveryComplete:
              true,

            dailyOddsCredits,

            dailyOddsBudget:
              DAILY_ODDS_BUDGET,

            monthlyOddsCredits,

            monthlyOddsBudget:
              MONTHLY_ODDS_BUDGET,
          })
        }

        reason =
          discoveryReason
      }
    }

    // --------------------------------------------------
    // ACTIVE WEEK
    // --------------------------------------------------

    if (activeWeek) {
      if (
        !activeWeek.starts_at ||
        !activeWeek.ends_at
      ) {
        if (isCron) {
          return NextResponse.json({
            success: true,
            skipped: true,

            reason:
              'Active week does not have a complete game window. No Odds API credit used.',

            dailyOddsCredits,

            dailyOddsBudget:
              DAILY_ODDS_BUDGET,

            monthlyOddsCredits,

            monthlyOddsBudget:
              MONTHLY_ODDS_BUDGET,
          })
        }

        reason =
          'Manual odds sync for active week with incomplete game window.'
      } else {
        // ----------------------------------------------
        // NEXT UPCOMING STORED GAME IN ACTIVE WEEK
        // ----------------------------------------------

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
            activeWeek.starts_at
          )
          .lt(
            'start_time',
            activeWeek.ends_at
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

        // ----------------------------------------------
        // MANUAL ADMIN REQUEST
        //
        // Manual sync bypasses the automatic sleep
        // schedule but still respects monthly/daily
        // safety budgets.
        // ----------------------------------------------

        if (!isCron) {
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

            reason =
              `Manual odds sync. Next kickoff is approximately ${hoursUntilNextGame.toFixed(
                1
              )} hours away.`
          } else {
            reason =
              'Manual odds sync. No upcoming stored game was found in the active week.'
          }
        }

        // ----------------------------------------------
        // AUTOMATIC CRON
        // ----------------------------------------------

        if (isCron) {
          // --------------------------------------------
          // NO STORED GAME YET
          //
          // Allow exactly one discovery request for
          // this active week.
          // --------------------------------------------

          if (!nextGame) {
            const discoveryReason =
              `Active-week discovery for week ${activeWeek.id}.`

            const discoveryAlreadySucceeded =
              await hasSuccessfulDiscovery(
                discoveryReason
              )

            if (
              discoveryAlreadySucceeded
            ) {
              return NextResponse.json({
                success: true,
                skipped: true,

                reason:
                  'Active-week discovery already completed and no upcoming stored game is currently available. No Odds API credit used.',

                discoveryComplete:
                  true,

                dailyOddsCredits,

                dailyOddsBudget:
                  DAILY_ODDS_BUDGET,

                monthlyOddsCredits,

                monthlyOddsBudget:
                  MONTHLY_ODDS_BUDGET,
              })
            }

            reason =
              discoveryReason
          }

          // --------------------------------------------
          // STORED GAME EXISTS
          // --------------------------------------------

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

            // ------------------------------------------
            // DEEP SLEEP
            //
            // Once discovery has loaded the slate, do
            // not spend another odds credit until the
            // next kickoff is within 12 hours.
            //
            // Example:
            // Sunday discovery finds Wednesday game.
            // Monday = 0 calls.
            // Tuesday = 0 calls.
            // Wednesday morning = syncing resumes.
            // ------------------------------------------

            if (
              hoursUntilNextGame >
              AUTOMATIC_WAKE_HOURS_BEFORE_KICKOFF
            ) {
              const wakeAt =
                new Date(
                  new Date(
                    nextGame.start_time
                  ).getTime() -
                    AUTOMATIC_WAKE_HOURS_BEFORE_KICKOFF *
                      60 *
                      60 *
                      1000
                )

              return NextResponse.json({
                success: true,
                skipped: true,

                reason:
                  `Next kickoff is ${hoursUntilNextGame.toFixed(
                    1
                  )} hours away. Automatic odds syncing is sleeping until 12 hours before kickoff.`,

                sleeping: true,

                nextKickoffAt:
                  nextGame.start_time,

                automaticWakeAt:
                  wakeAt.toISOString(),

                hoursUntilNextGame:
                  Number(
                    hoursUntilNextGame.toFixed(
                      2
                    )
                  ),

                dailyOddsCredits,

                dailyOddsBudget:
                  DAILY_ODDS_BUDGET,

                monthlyOddsCredits,

                monthlyOddsBudget:
                  MONTHLY_ODDS_BUDGET,
              })
            }

            // ------------------------------------------
            // INSIDE 12 HOURS
            // ------------------------------------------

            refreshMinutes =
              getAutomaticRefreshMinutes(
                hoursUntilNextGame
              )

            reason =
              formatAutomaticReason(
                hoursUntilNextGame,
                refreshMinutes
              )

            // ------------------------------------------
            // LAST SUCCESSFUL ODDS REQUEST
            // ------------------------------------------

            const {
              data: lastSuccessfulSync,
              error:
                lastSuccessfulSyncError,
            } = await supabase
              .from(
                'odds_api_usage'
              )
              .select(`
                id,
                called_at
              `)
              .eq(
                'endpoint',
                'odds'
              )
              .eq(
                'status',
                'succeeded'
              )
              .order(
                'called_at',
                {
                  ascending: false,
                }
              )
              .limit(1)
              .maybeSingle()

            if (
              lastSuccessfulSyncError
            ) {
              throw new Error(
                lastSuccessfulSyncError.message
              )
            }

            if (
              lastSuccessfulSync?.called_at
            ) {
              const lastSyncTime =
                new Date(
                  lastSuccessfulSync.called_at
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
                    reason,

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

                  hoursUntilNextGame:
                    Number(
                      hoursUntilNextGame.toFixed(
                        2
                      )
                    ),

                  dailyOddsCredits,

                  dailyOddsBudget:
                    DAILY_ODDS_BUDGET,

                  monthlyOddsCredits,

                  monthlyOddsBudget:
                    MONTHLY_ODDS_BUDGET,
                })
              }
            }
          }
        }
      }
    }

    // --------------------------------------------------
    // FINAL BUDGET SAFETY CHECK
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

      reason,

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