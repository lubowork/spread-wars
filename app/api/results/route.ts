import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createAdminClient } from '../../../lib/supabase-admin'

const MONTHLY_RESULTS_BUDGET = 200

// A game must have been underway for at least this
// long before an automatic score request is justified.
const MIN_HOURS_AFTER_KICKOFF = 3.5

type AuthorizationResult = {
  authorized: boolean
  isCron: boolean
}

type EasternParts = {
  dateKey: string
  weekday: string
  hour: number
  minute: number
}

type PendingGame = {
  id: string
  external_game_id: string
  home_team: string
  away_team: string
  start_time: string
  completed: boolean
}

type AutomaticSlot = {
  key: string
  description: string
  candidateGameIds: string[]
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
  // SIGNED-IN SPREAD WARS PLAYER
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

function getEasternParts(
  date: Date
): EasternParts {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'America/New_York',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        weekday:
          'short',

        hour:
          '2-digit',

        minute:
          '2-digit',

        hourCycle:
          'h23',
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
    )?.value ?? ''

  const month =
    parts.find(
      (part) =>
        part.type === 'month'
    )?.value ?? ''

  const day =
    parts.find(
      (part) =>
        part.type === 'day'
    )?.value ?? ''

  const weekday =
    parts.find(
      (part) =>
        part.type === 'weekday'
    )?.value ?? ''

  const hour =
    Number(
      parts.find(
        (part) =>
          part.type === 'hour'
      )?.value ?? 0
    )

  const minute =
    Number(
      parts.find(
        (part) =>
          part.type === 'minute'
      )?.value ?? 0
    )

  return {
    dateKey:
      `${year}-${month}-${day}`,

    weekday,

    hour,

    minute,
  }
}

function getPreviousDateKey(
  dateKey: string
) {
  const [
    year,
    month,
    day,
  ] =
    dateKey
      .split('-')
      .map(Number)

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    )

  date.setUTCDate(
    date.getUTCDate() - 1
  )

  const previousYear =
    date
      .getUTCFullYear()
      .toString()
      .padStart(
        4,
        '0'
      )

  const previousMonth =
    (
      date.getUTCMonth() +
      1
    )
      .toString()
      .padStart(
        2,
        '0'
      )

  const previousDay =
    date
      .getUTCDate()
      .toString()
      .padStart(
        2,
        '0'
      )

  return `${previousYear}-${previousMonth}-${previousDay}`
}

function getClockMinutes(
  parts: EasternParts
) {
  return (
    parts.hour * 60 +
    parts.minute
  )
}

function getHoursSinceKickoff(
  game: PendingGame,
  now: Date
) {
  return (
    now.getTime() -
    new Date(
      game.start_time
    ).getTime()
  ) /
    (
      1000 *
      60 *
      60
    )
}

function isMatureEnough(
  game: PendingGame,
  now: Date
) {
  return (
    getHoursSinceKickoff(
      game,
      now
    ) >=
    MIN_HOURS_AFTER_KICKOFF
  )
}

function getSaturdayGames(
  pendingGames: PendingGame[]
) {
  return pendingGames.filter(
    (game) =>
      getEasternParts(
        new Date(
          game.start_time
        )
      ).weekday ===
      'Sat'
  )
}

function getAutomaticSlot(
  now: Date,
  pendingGames: PendingGame[]
): AutomaticSlot | null {
  const nowParts =
    getEasternParts(
      now
    )

  const clockMinutes =
    getClockMinutes(
      nowParts
    )

  // --------------------------------------------------
  // FOLLOWING-MORNING MIDWEEK CHECK
  //
  // Sunday-Friday games get one automatic score-check
  // opportunity beginning at 5:00 AM ET the following
  // morning.
  //
  // The window stays open until noon so a temporarily
  // delayed Cron job does not completely miss the slot.
  //
  // Saturday games are intentionally excluded because
  // they use the dedicated Saturday schedule below.
  // --------------------------------------------------

  const MIDWEEK_START =
    5 * 60

  const MIDWEEK_END =
    12 * 60

  if (
    clockMinutes >=
      MIDWEEK_START &&
    clockMinutes <
      MIDWEEK_END
  ) {
    const previousDateKey =
      getPreviousDateKey(
        nowParts.dateKey
      )

    const midweekCandidates =
      pendingGames.filter(
        (game) => {
          const gameParts =
            getEasternParts(
              new Date(
                game.start_time
              )
            )

          if (
            gameParts.dateKey !==
            previousDateKey
          ) {
            return false
          }

          if (
            gameParts.weekday ===
            'Sat'
          ) {
            return false
          }

          return isMatureEnough(
            game,
            now
          )
        }
      )

    if (
      midweekCandidates.length >
      0
    ) {
      return {
        key:
          `${nowParts.dateKey}-05:00-midweek`,

        description:
          '5:00 AM ET following-morning score check.',

        candidateGameIds:
          midweekCandidates.map(
            (game) =>
              game.id
          ),
      }
    }
  }

  // --------------------------------------------------
  // SATURDAY 3:30 PM
  //
  // This slot remains active until the 7:30 PM slot.
  // Cron will still only be allowed one paid call in
  // the entire slot.
  // --------------------------------------------------

  if (
    nowParts.weekday ===
      'Sat'
  ) {
    const saturdayGames =
      getSaturdayGames(
        pendingGames
      )

    const maturedSaturdayGames =
      saturdayGames.filter(
        (game) =>
          isMatureEnough(
            game,
            now
          )
      )

    const SLOT_330 =
      15 * 60 + 30

    const SLOT_730 =
      19 * 60 + 30

    const SLOT_1030 =
      22 * 60 + 30

    if (
      clockMinutes >=
        SLOT_330 &&
      clockMinutes <
        SLOT_730 &&
      maturedSaturdayGames.length >
        0
    ) {
      return {
        key:
          `${nowParts.dateKey}-15:30-saturday`,

        description:
          'Saturday 3:30 PM ET score check.',

        candidateGameIds:
          maturedSaturdayGames.map(
            (game) =>
              game.id
          ),
      }
    }

    // ------------------------------------------------
    // SATURDAY 7:30 PM
    // ------------------------------------------------

    if (
      clockMinutes >=
        SLOT_730 &&
      clockMinutes <
        SLOT_1030 &&
      maturedSaturdayGames.length >
        0
    ) {
      return {
        key:
          `${nowParts.dateKey}-19:30-saturday`,

        description:
          'Saturday 7:30 PM ET score check.',

        candidateGameIds:
          maturedSaturdayGames.map(
            (game) =>
              game.id
          ),
      }
    }

    // ------------------------------------------------
    // SATURDAY 10:30 PM
    //
    // Remains the active slot through midnight.
    // ------------------------------------------------

    if (
      clockMinutes >=
        SLOT_1030 &&
      maturedSaturdayGames.length >
        0
    ) {
      return {
        key:
          `${nowParts.dateKey}-22:30-saturday`,

        description:
          'Saturday 10:30 PM ET score check.',

        candidateGameIds:
          maturedSaturdayGames.map(
            (game) =>
              game.id
          ),
      }
    }
  }

  // --------------------------------------------------
  // SUNDAY 2:00 AM
  //
  // Final automatic check for Saturday's slate.
  //
  // Keep the slot open until 5:00 AM ET so a delayed
  // Cron execution still has time to perform the final
  // Saturday grading pass.
  // --------------------------------------------------

  if (
    nowParts.weekday ===
      'Sun'
  ) {
    const SLOT_200 =
      2 * 60

    const SLOT_END =
      5 * 60

    if (
      clockMinutes >=
        SLOT_200 &&
      clockMinutes <
        SLOT_END
    ) {
      const saturdayGames =
        getSaturdayGames(
          pendingGames
        )

      const maturedSaturdayGames =
        saturdayGames.filter(
          (game) =>
            isMatureEnough(
              game,
              now
            )
        )

      if (
        maturedSaturdayGames.length >
        0
      ) {
        const saturdayDate =
          getPreviousDateKey(
            nowParts.dateKey
          )

        return {
          key:
            `${saturdayDate}-02:00-sunday-final`,

          description:
            'Sunday 2:00 AM ET final Saturday score check.',

          candidateGameIds:
            maturedSaturdayGames.map(
              (game) =>
                game.id
            ),
        }
      }
    }
  }

  return null
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

    // --------------------------------------------------
    // FIND ALL PENDING PICKS
    // --------------------------------------------------

    const {
      data: pendingPicks,
      error:
        pendingPicksError,
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

    if (
      pendingPicksError
    ) {
      throw new Error(
        pendingPicksError.message
      )
    }

    if (
      !pendingPicks ||
      pendingPicks.length ===
        0
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,

        reason:
          'There are no pending picks to grade. No Scores API credits used.',
      })
    }

    // --------------------------------------------------
    // UNIQUE GAMES WITH PENDING PICKS
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
      error:
        pendingGamesError,
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

    if (
      pendingGamesError
    ) {
      throw new Error(
        pendingGamesError.message
      )
    }

    if (
      !pendingGames ||
      pendingGames.length ===
        0
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,

        reason:
          'No unfinished games have pending picks. No Scores API credits used.',
      })
    }

    const now =
      new Date()

    // --------------------------------------------------
    // AUTOMATIC VS MANUAL
    // --------------------------------------------------

    let gradingCandidates:
      PendingGame[] = []

    let usageReason =
      ''

    let automaticSlot:
      AutomaticSlot | null =
        null

    if (isCron) {
      automaticSlot =
        getAutomaticSlot(
          now,
          pendingGames
        )

      if (!automaticSlot) {
        return NextResponse.json({
          success: true,
          skipped: true,

          reason:
            'No automatic scoring window is active right now. No Scores API credits used.',

          schedule:
            'Saturday: 3:30 PM, 7:30 PM, 10:30 PM ET; Sunday: 2:00 AM ET final Saturday check; non-Saturday games: 5:00 AM ET the following morning.',
        })
      }

      const candidateSet =
        new Set(
          automaticSlot
            .candidateGameIds
        )

      gradingCandidates =
        pendingGames.filter(
          (game) =>
            candidateSet.has(
              game.id
            )
        )

      if (
        gradingCandidates.length ===
        0
      ) {
        return NextResponse.json({
          success: true,
          skipped: true,

          reason:
            'The scoring window is active, but no pending game is mature enough to justify a paid score request.',
        })
      }

      usageReason =
        `Automatic results slot ${automaticSlot.key}. ${automaticSlot.description} Checking ${gradingCandidates.length} unfinished game(s) with pending picks.`
    } else {
      // ----------------------------------------------
      // MANUAL ADMIN GRADE RESULTS
      //
      // Manual grading can run outside the automatic
      // schedule, but we still refuse to spend credits
      // on games that have not been underway long
      // enough to plausibly be final.
      // ----------------------------------------------

      gradingCandidates =
        pendingGames.filter(
          (game) =>
            isMatureEnough(
              game,
              now
            )
        )

      if (
        gradingCandidates.length ===
        0
      ) {
        return NextResponse.json({
          success: true,
          skipped: true,

          reason:
            `No pending game has been underway for at least ${MIN_HOURS_AFTER_KICKOFF} hours. No Scores API credits used.`,
        })
      }

      usageReason =
        `Manual results check for ${gradingCandidates.length} unfinished game(s) with pending picks.`
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
        status,
        reason
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

    const allResultsUsageRows =
      usageRows ?? []

    const monthlyResultsCredits =
      allResultsUsageRows.reduce(
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

    if (
      monthlyResultsCredits + 2 >
      MONTHLY_RESULTS_BUDGET
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,

        reason:
          'Next Scores API request would exceed the monthly results budget. No Scores API credits used.',

        monthlyResultsCredits,

        monthlyResultsBudget:
          MONTHLY_RESULTS_BUDGET,
      })
    }

    // --------------------------------------------------
    // ONE PAID CALL PER AUTOMATIC SLOT
    //
    // Attempted, succeeded, or failed all count as the
    // slot having been used. This is conservative
    // because a failed provider request may still have
    // consumed credits.
    // --------------------------------------------------

    if (
      isCron &&
      automaticSlot
    ) {
      const slotPrefix =
        `Automatic results slot ${automaticSlot.key}.`

      const slotAlreadyUsed =
        allResultsUsageRows.some(
          (row) =>
            typeof row.reason ===
              'string' &&
            row.reason.startsWith(
              slotPrefix
            )
        )

      if (slotAlreadyUsed) {
        return NextResponse.json({
          success: true,
          skipped: true,

          reason:
            `${automaticSlot.description} This automatic scoring slot has already used its one permitted Scores API request.`,

          automaticSlot:
            automaticSlot.key,

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
    // RECORD PAID ATTEMPT
    //
    // Scores + daysFrom=1 normally costs 2 credits.
    // Record before the provider request so quota
    // protection remains conservative.
    // --------------------------------------------------

    const {
      data: usageRun,
      error:
        usageInsertError,
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
          usageReason,
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
    // SCORES API
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

    let response:
      Response

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
    // ACTUAL API-REPORTED COST
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

      if (
        updateGameError
      ) {
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
        // ----------------------------------------------
        // AUTOMATIC PICKS REQUIRE OFFICIAL LOCKED LINE
        // ----------------------------------------------

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
          result =
            'win'
        } else if (
          adjustedMargin < 0
        ) {
          result =
            'loss'
        } else {
          result =
            'push'
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
    // MARK USAGE SUCCESSFUL
    // --------------------------------------------------

    const {
      error:
        usageUpdateError,
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

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return NextResponse.json({
      success: true,
      skipped: false,

      automatic:
        isCron,

      automaticSlot:
        automaticSlot?.key ??
        null,

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