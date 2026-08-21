import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { getCollegeFootballOdds } from '../../../lib/odds-api'

function isAuthorized(request: Request) {
  const authHeader =
    request.headers.get('authorization')

  const expected =
    `Bearer ${process.env.CRON_SECRET}`

  return (
    process.env.CRON_SECRET &&
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

    const supabase =
      createAdminClient()

    const games =
      await getCollegeFootballOdds()

    let gamesSaved = 0
    let oddsSaved = 0

    for (const game of games) {
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
              new Date()
                .toISOString(),
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

    return NextResponse.json({
      success: true,
      gamesSaved,
      oddsSaved,
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
      { status: 500 }
    )
  }
}