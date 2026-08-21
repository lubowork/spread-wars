import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { getCollegeFootballOdds } from '../../../lib/odds-api'

async function isAuthorized(
  request: Request
) {
  // Allow Supabase Cron
  const authHeader =
    request.headers.get(
      'authorization'
    )

  const cronSecret =
    process.env.CRON_SECRET

  if (
    cronSecret &&
    authHeader ===
      `Bearer ${cronSecret}`
  ) {
    return true
  }

  // Otherwise require a logged-in
  // Geoff or General account
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

  if (error || !player) {
    return false
  }

  return true
}

export async function POST(
  request: Request
) {
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