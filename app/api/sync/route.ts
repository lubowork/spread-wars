import { NextResponse } from 'next/server'
import { getCollegeFootballOdds } from '../../../lib/odds-api'
import { createAdminClient } from '../../../lib/supabase-admin'

function isPennState(team: string) {
  return team.toLowerCase().includes('penn state')
}

function isMiami(team: string) {
  const name = team.toLowerCase()

  return (
    name.includes('miami') &&
    name.includes('hurricane')
  )
}

export async function GET() {
  try {
    const supabase = createAdminClient()
    const games = await getCollegeFootballOdds()

    let gamesSaved = 0
    let oddsSaved = 0

    for (const game of games) {
      const { data: savedGame, error: gameError } =
        await supabase
          .from('games')
          .upsert(
            {
              external_game_id: game.id,
              home_team: game.homeTeam,
              away_team: game.awayTeam,
              start_time: game.commenceTime,
            },
            {
              onConflict: 'external_game_id',
            }
          )
          .select()
          .single()

      if (gameError) {
        throw new Error(
          `Game save failed: ${gameError.message}`
        )
      }

      gamesSaved++

      for (const spread of game.spreads) {
        const { error: oddsError } = await supabase
          .from('odds')
          .insert({
            game_id: savedGame.id,
            sportsbook: 'DraftKings',
            market: 'spreads',
            team: spread.team,
            spread: spread.point,
            price: spread.price,
          })

        if (oddsError) {
          // Duplicate odds are okay during repeated syncs.
          if (!oddsError.message.includes('duplicate')) {
            throw new Error(
              `Odds save failed: ${oddsError.message}`
            )
          }
        } else {
          oddsSaved++
        }
      }
    }

    return NextResponse.json({
      success: true,
      gamesReturned: games.length,
      gamesSaved,
      oddsSaved,
    })
  } catch (error) {
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