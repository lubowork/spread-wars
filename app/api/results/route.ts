import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

function isAuthorized(
  request: Request
) {
  const authHeader =
    request.headers.get(
      'authorization'
    )

  const expected =
    `Bearer ${process.env.CRON_SECRET}`

  return (
    !!process.env.CRON_SECRET &&
    authHeader === expected
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

    const apiKey =
      process.env.ODDS_API_KEY

    if (!apiKey) {
      throw new Error(
        'ODDS_API_KEY is missing.'
      )
    }

    const supabase =
      createAdminClient()

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
      '3'
    )

    url.searchParams.set(
      'dateFormat',
      'iso'
    )

    const response =
      await fetch(
        url.toString(),
        {
          cache: 'no-store',
        }
      )

    if (!response.ok) {
      throw new Error(
        `Scores API returned ${response.status}`
      )
    }

    const scores =
      await response.json()

    let gamesUpdated = 0
    let picksGraded = 0
    let skippedUnlocked = 0

    for (
      const scoreGame of scores
    ) {
      if (!scoreGame.completed) {
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
        Number.isNaN(homeScore) ||
        Number.isNaN(awayScore)
      ) {
        continue
      }

      // ---------------------------------------------
      // FIND OUR GAME
      // ---------------------------------------------

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

      // ---------------------------------------------
      // UPDATE FINAL SCORE
      // ---------------------------------------------

      const {
        error: updateGameError,
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

      // ---------------------------------------------
      // GET PENDING PICKS
      // ---------------------------------------------

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
        // Automatic picks MUST have
        // their one-hour line locked.
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

        let teamScore: number
        let opponentScore: number

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
          'win' |
          'loss' |
          'push'

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

    return NextResponse.json({
      success: true,
      gamesUpdated,
      picksGraded,
      skippedUnlocked,
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
      { status: 500 }
    )
  }
}