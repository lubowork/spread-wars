import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

const SCORES_URL =
  'https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/scores'

type ApiScore = {
  name: string
  score: string
}

type ApiGame = {
  id: string
  completed: boolean
  home_team: string
  away_team: string
  scores: ApiScore[] | null
}

function gradePick(
  pickedTeam: string,
  spread: number,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number
) {
  let teamScore: number
  let opponentScore: number

  if (pickedTeam === homeTeam) {
    teamScore = homeScore
    opponentScore = awayScore
  } else if (pickedTeam === awayTeam) {
    teamScore = awayScore
    opponentScore = homeScore
  } else {
    throw new Error(
      `Picked team ${pickedTeam} does not match game teams.`
    )
  }

  const adjustedMargin =
    teamScore - opponentScore + spread

  if (adjustedMargin > 0) {
    return 'win'
  }

  if (adjustedMargin < 0) {
    return 'loss'
  }

  return 'push'
}

export async function GET() {
  try {
    const apiKey = process.env.ODDS_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'ODDS_API_KEY is not configured.',
        },
        { status: 500 }
      )
    }

    const url = new URL(SCORES_URL)

    url.searchParams.set('apiKey', apiKey)
    url.searchParams.set('daysFrom', '3')
    url.searchParams.set('dateFormat', 'iso')

    const response = await fetch(
      url.toString(),
      {
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      const body = await response.text()

      return NextResponse.json(
        {
          success: false,
          error:
            `Scores API returned ${response.status}: ${body}`,
        },
        { status: 500 }
      )
    }

    const apiGames: ApiGame[] =
      await response.json()

    const supabase =
      createAdminClient()

    let gamesUpdated = 0
    let picksGraded = 0

    const results = []

    for (const apiGame of apiGames) {
      if (
        !apiGame.completed ||
        !apiGame.scores
      ) {
        continue
      }

      const homeScoreEntry =
        apiGame.scores.find(
          (score) =>
            score.name ===
            apiGame.home_team
        )

      const awayScoreEntry =
        apiGame.scores.find(
          (score) =>
            score.name ===
            apiGame.away_team
        )

      if (
        !homeScoreEntry ||
        !awayScoreEntry
      ) {
        continue
      }

      const homeScore =
        Number(homeScoreEntry.score)

      const awayScore =
        Number(awayScoreEntry.score)

      if (
        Number.isNaN(homeScore) ||
        Number.isNaN(awayScore)
      ) {
        continue
      }

      // --------------------------------------
      // Find our stored game
      // --------------------------------------

      const {
        data: storedGame,
        error: gameError,
      } = await supabase
        .from('games')
        .select(
          `
          id,
          external_game_id,
          home_team,
          away_team
          `
        )
        .eq(
          'external_game_id',
          apiGame.id
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

      // --------------------------------------
      // Update final score
      // --------------------------------------

      const {
        error: updateGameError,
      } = await supabase
        .from('games')
        .update({
          completed: true,
          home_score: homeScore,
          away_score: awayScore,
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

      // --------------------------------------
      // Get picks for this game
      // --------------------------------------

      const {
        data: picks,
        error: picksError,
      } = await supabase
        .from('picks')
        .select(
          `
          id,
          player_id,
          team,
          spread,
          locked_spread,
          line_locked,
          result
          `
        )
        .eq(
          'game_id',
          storedGame.id
        )

      if (picksError) {
        throw new Error(
          picksError.message
        )
      }

      for (const pick of picks ?? []) {
        if (pick.result !== 'pending') {
          continue
        }

        // Use locked spread when available.
        // Normal draft picks should already be locked.
        const officialSpread =
          pick.locked_spread !== null
            ? Number(
                pick.locked_spread
              )
            : Number(
                pick.spread
              )

        const result =
          gradePick(
            pick.team,
            officialSpread,
            storedGame.home_team,
            storedGame.away_team,
            homeScore,
            awayScore
          )

        const {
          error: updatePickError,
        } = await supabase
          .from('picks')
          .update({
            result,
          })
          .eq(
            'id',
            pick.id
          )

        if (updatePickError) {
          throw new Error(
            updatePickError.message
          )
        }

        picksGraded++

        results.push({
          team: pick.team,
          spread:
            officialSpread,
          final:
            `${awayScore}-${homeScore}`,
          result,
        })
      }
    }

    return NextResponse.json({
      success: true,
      gamesReturned:
        apiGames.length,
      gamesUpdated,
      picksGraded,
      results,
    })
  } catch (error) {
    console.error(
      'Results sync error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
      { status: 500 }
    )
  }
}