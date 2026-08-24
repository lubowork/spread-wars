import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createAdminClient } from '../../../lib/supabase-admin'

const MONTHLY_RESULTS_BUDGET = 200

// Don't start asking for a final score until
// a game has been underway for at least this long.
const MIN_HOURS_AFTER_KICKOFF = 3.5

// Once we're in the grading window, don't make
// another paid scores request more often than this.
const RESULTS_REFRESH_MINUTES = 60

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

  // Allow signed-in player
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
          error: 'Unauthorized',
        },
        {
          status: 401,
        }
      )
    }

    // --------------------------------------------------
    // FIND ALL PENDING PICKS
    // --------------------------------------------------

    const {
      data: pendingPicks,
      error: pendingPicksError,
    } = await supabase
      .from('picks')
      .select(`
        id,
        game_id,
        result
      `)
      .eq(
        'result',
        'pending'
      )

    if (pendingPicksError) {
      throw new Error(
        pendingPicksError.message
      )
    }

    if (
      !pendingPicks ||
      pendingPicks.length === 0
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason:
          'There are no pending picks to grade. No Scores API credits used.',
      })
    }

    // --------------------------------------------------
    // UNIQUE GAMES THAT STILL HAVE PENDING PICKS
    // --------------------------------------------------

    const pendingGameIds =
      Array.from(
        new Set(
          pendingPicks.map(
            (pick) =>
              pick.game_id
          )
        )
      )

    const {
      data: pendingGames,
      error: pendingGamesError,
    } = await supabase
      .from('games')
      .select(`
        id,
        external_game_id,
        home_team,
        away_team,
        start_time,
        completed
      `)
      .in(
        'id',
        pendingGameIds
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

    if (pendingGamesError) {
      throw new Error(
        pendingGamesError.message
      )
    }

    if (
      !pendingGames ||
      pendingGames.length === 0
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason:
          'No unfinished games have pending picks. No Scores API credits used.',
      })
    }

    // --------------------------------------------------
    // ONLY SPEND CREDITS IF A GAME SHOULD BE NEAR FINAL
    // --------------------------------------------------

    const now =
      new Date()

    const gradingCandidates =
      pendingGames.filter(
        (game) => {
          const kickoff =
            new Date(
              game.start_time
            ).getTime()

          const hoursSinceKickoff =
            (
              now.getTime() -
              kickoff
            ) /
            (
              1000 *
              60 *
              60
            )

          return (
            hoursSinceKickoff >=
            MIN_HOURS_AFTER_KICKOFF
          )
        }
      )

    if (
      gradingCandidates.length === 0
    ) {
      const nextPendingGame =
        pendingGames[0]

      const kickoff =
        new Date(
          nextPendingGame.start_time
        )

      const firstEligibleCheck =
        new Date(
          kickoff.getTime() +
            MIN_HOURS_AFTER_KICKOFF *
              60 *
              60 *
              1000
        )

      return NextResponse.json({
        success: true,
        skipped: true,
        reason:
          'Pending games have not been underway long enough to justify a paid score check.',
        firstEligibleCheck:
          firstEligibleCheck.toISOString(),
        noCreditsUsed: true,
      })
    }

    // --------------------------------------------------
    // MONTHLY RESULTS BUDGET
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
        'scores'
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

    const monthlyResultsCredits =
      (
        usageRows ?? []
      ).reduce(
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
      monthlyResultsCredits >=
      MONTHLY_RESULTS_BUDGET
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason:
          'Monthly Spread Wars results budget reached. No Scores API credits used.',
        monthlyResultsCredits,
        monthlyResultsBudget:
          MONTHLY_RESULTS_BUDGET,
      })
    }

    // --------------------------------------------------
    // DON'T CHECK MORE THAN ONCE PER HOUR
    // --------------------------------------------------

    const lastResultsSync =
      usageRows &&
      usageRows.length > 0
        ? usageRows[0]
        : null

    if (
      lastResultsSync?.called_at
    ) {
      const lastSyncTime =
        new Date(
          lastResultsSync.called_at
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
        RESULTS_REFRESH_MINUTES
      ) {
        const nextEligibleAt =
          new Date(
            lastSyncTime +
              RESULTS_REFRESH_MINUTES *
                60 *
                1000
          )

        return NextResponse.json({
          success: true,
          skipped: true,
          reason:
            'Scores were checked recently. No Scores API credits used.',
          minutesSinceLastSync:
            Math.round(
              minutesSinceLastSync
            ),
          nextEligibleAt:
            nextEligibleAt.toISOString(),
          monthlyResultsCredits,
          monthlyResultsBudget:
            MONTHLY_RESULTS_BUDGET,
        })
      }
    }

    // --------------------------------------------------
    // API KEY
    // --------------------------------------------------

    const apiKey =
      process.env.ODDS_API_KEY

    if (!apiKey) {
      throw new Error(
        'ODDS_API_KEY is missing.'
      )
    }

    // --------------------------------------------------
    // RECORD THE PAID ATTEMPT
    //
    // Scores + daysFrom costs 2 credits.
    // Record it before the request for conservative
    // quota protection.
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
          'scores',

        credits:
          2,

        status:
          'attempted',

        reason:
          `Checking ${gradingCandidates.length} unfinished game(s) with pending picks at least ${MIN_HOURS_AFTER_KICKOFF} hours after kickoff.`,
      })
      .select('id')
      .single()

    if (usageInsertError) {
      throw new Error(
        usageInsertError.message
      )
    }

    // --------------------------------------------------
    // SCORES API
    //
    // daysFrom=1 is enough for our grading job.
    // Using daysFrom costs 2 credits.
    // --------------------------------------------------

    const url =
      new URL(
        'https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/scores'
      )

    url.searchParams.set(
      'apiKey',
      apiKey
    )

    url.searchParams.set(
      'daysFrom',
      '1'
    )

    url.searchParams.set(
      'dateFormat',
      'iso'
    )

    let response: Response

    try {
      response =
        await fetch(
          url.toString(),
          {
            cache:
              'no-store',
          }
        )
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
              : 'Unknown scores fetch error',
        })
        .eq(
          'id',
          usageRun.id
        )

      throw error
    }

    if (!response.ok) {
      const errorMessage =
        `Scores API returned ${response.status}`

      await supabase
        .from(
          'odds_api_usage'
        )
        .update({
          status:
            'failed',

          error:
            errorMessage,
        })
        .eq(
          'id',
          usageRun.id
        )

      throw new Error(
        errorMessage
      )
    }

    // --------------------------------------------------
    // USE ACTUAL API-REPORTED COST IF AVAILABLE
    // --------------------------------------------------

    const reportedCost =
      Number(
        response.headers.get(
          'x-requests-last'
        )
      )

    const actualCost =
      Number.isFinite(
        reportedCost
      ) &&
      reportedCost > 0
        ? reportedCost
        : 2

    const scores =
      await response.json()

    let gamesUpdated = 0
    let picksGraded = 0
    let skippedUnlocked = 0

    // --------------------------------------------------
    // PROCESS COMPLETED GAMES
    // --------------------------------------------------

    for (
      const scoreGame of
      scores
    ) {
      if (
        !scoreGame.completed
      ) {
        continue
      }

      const homeScoreItem =
        scoreGame.scores?.find(
          (score: any) =>
            score.name ===
            scoreGame.home_team
        )

      const awayScoreItem =
        scoreGame.scores?.find(
          (score: any) =>
            score.name ===
            scoreGame.away_team
        )

      if (
        !homeScoreItem ||
        !awayScoreItem
      ) {
        continue
      }

      const homeScore =
        Number(
          homeScoreItem.score
        )

      const awayScore =
        Number(
          awayScoreItem.score
        )

      if (
        Number.isNaN(
          homeScore
        ) ||
        Number.isNaN(
          awayScore
        )
      ) {
        continue
      }

      const {
        data: storedGame,
        error: gameError,
      } = await supabase
        .from('games')
        .select(`
          id,
          home_team,
          away_team
        `)
        .eq(
          'external_game_id',
          scoreGame.id
        )
        .maybeSingle()

      if (gameError) {
        throw new Error(
          gameError.message
        )
      }

      if (!storedGame) {
        continue
      }

      // Only care about games in our pending set.
      if (
        !pendingGameIds.includes(
          storedGame.id
        )
      ) {
        continue
      }

      const {
        error:
          updateGameError,
      } = await supabase
        .from('games')
        .update({
          completed:
            true,

          home_score:
            homeScore,

          away_score:
            awayScore,
        })
        .eq(
          'id',
          storedGame.id
        )

      if (updateGameError) {
        throw new Error(
          updateGameError.message
        )
      }

      gamesUpdated++

      const {
        data: picks,
        error: picksError,
      } = await supabase
        .from('picks')
        .select(`
          id,
          team,
          spread,
          locked_spread,
          line_locked,
          is_automatic,
          result
        `)
        .eq(
          'game_id',
          storedGame.id
        )
        .eq(
          'result',
          'pending'
        )

      if (picksError) {
        throw new Error(
          picksError.message
        )
      }

      for (
        const pick of
        picks ?? []
      ) {
        // Never grade an automatic pick
        // without its official locked line.
        if (
          pick.is_automatic &&
          !pick.line_locked
        ) {
          skippedUnlocked++
          continue
        }

        const officialSpread =
          pick.locked_spread !==
          null
            ? Number(
                pick.locked_spread
              )
            : Number(
                pick.spread
              )

        if (
          Number.isNaN(
            officialSpread
          )
        ) {
          continue
        }

        let teamScore:
          number

        let opponentScore:
          number

        if (
          pick.team ===
          storedGame.home_team
        ) {
          teamScore =
            homeScore

          opponentScore =
            awayScore
        } else if (
          pick.team ===
          storedGame.away_team
        ) {
          teamScore =
            awayScore

          opponentScore =
            homeScore
        } else {
          continue
        }

        const adjustedMargin =
          teamScore -
          opponentScore +
          officialSpread

        let result:
          | 'win'
          | 'loss'
          | 'push'

        if (
          adjustedMargin > 0
        ) {
          result = 'win'
        } else if (
          adjustedMargin < 0
        ) {
          result = 'loss'
        } else {
          result = 'push'
        }

        const {
          error:
            resultUpdateError,
        } = await supabase
          .from('picks')
          .update({
            result,
          })
          .eq(
            'id',
            pick.id
          )

        if (
          resultUpdateError
        ) {
          throw new Error(
            resultUpdateError.message
          )
        }

        picksGraded++
      }
    }

    // --------------------------------------------------
    // MARK USAGE RECORD SUCCESSFUL
    // --------------------------------------------------

    const {
      error: usageUpdateError,
    } = await supabase
      .from(
        'odds_api_usage'
      )
      .update({
        credits:
          actualCost,

        status:
          'succeeded',

        games_saved:
          gamesUpdated,

        odds_saved:
          picksGraded,
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

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return NextResponse.json({
      success: true,
      skipped: false,
      gamesUpdated,
      picksGraded,
      skippedUnlocked,
      gradingCandidates:
        gradingCandidates.length,
      creditsUsed:
        actualCost,
      monthlyResultsCredits:
        monthlyResultsCredits +
        actualCost,
      monthlyResultsBudget:
        MONTHLY_RESULTS_BUDGET,
      apiRequestsRemaining:
        response.headers.get(
          'x-requests-remaining'
        ),
    })
  } catch (error) {
    console.error(
      'POST /api/results error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unknown result sync error.',
      },
      {
        status: 500,
      }
    )
  }
}