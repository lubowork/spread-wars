import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

function normalizeTeam(team: string) {
  return team
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

function matchesAutomaticTeam(
  actualTeam: string,
  automaticTeam: string
) {
  const actual = normalizeTeam(actualTeam)
  const automatic = normalizeTeam(automaticTeam)

  // Penn State may come from the API as
  // "Penn State Nittany Lions"
  if (automatic === 'penn state') {
    return actual.includes('penn state')
  }

  // University of Miami is commonly returned as
  // "Miami Hurricanes".
  // This intentionally does NOT match Miami (OH).
  if (automatic === 'miami') {
    return (
      actual === 'miami' ||
      actual.includes('miami hurricanes')
    )
  }

  return actual.includes(automatic)
}

export async function GET() {
  try {
    const supabase = createAdminClient()

    // --------------------------------------------------
    // 1. Get 2026 season
    // --------------------------------------------------

    const { data: season, error: seasonError } =
      await supabase
        .from('seasons')
        .select('id, year')
        .eq('year', 2026)
        .single()

    if (seasonError || !season) {
      return NextResponse.json(
        {
          success: false,
          error: '2026 season not found.',
        },
        { status: 404 }
      )
    }

    // --------------------------------------------------
    // 2. Get Week 1
    // --------------------------------------------------

    const { data: week, error: weekError } =
      await supabase
        .from('weeks')
        .select(
          'id, week_number, status'
        )
        .eq('season_id', season.id)
        .eq('week_number', 1)
        .single()

    if (weekError || !week) {
      return NextResponse.json(
        {
          success: false,
          error: 'Week 1 not found.',
        },
        { status: 404 }
      )
    }

    // --------------------------------------------------
    // 3. Get Geoff and General
    // --------------------------------------------------

    const { data: players, error: playersError } =
      await supabase
        .from('players')
        .select(
          'id, name, automatic_team'
        )

    if (playersError || !players) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to load players.',
        },
        { status: 500 }
      )
    }

    const geoff = players.find(
      (player) => player.name === 'Geoff'
    )

    const general = players.find(
      (player) => player.name === 'General'
    )

    if (!geoff || !general) {
      return NextResponse.json(
        {
          success: false,
          error: 'Geoff or General was not found.',
        },
        { status: 500 }
      )
    }

    // --------------------------------------------------
    // 4. Get upcoming games
    // --------------------------------------------------

    const { data: games, error: gamesError } =
      await supabase
        .from('games')
        .select(
          `
          id,
          home_team,
          away_team,
          start_time,
          completed
          `
        )
        .eq('completed', false)
        .gte(
          'start_time',
          new Date().toISOString()
        )
        .order('start_time')

    if (gamesError || !games) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to load games.',
        },
        { status: 500 }
      )
    }

    const automaticPlayers = [
      {
        player: geoff,
        pickNumber: 1,
      },
      {
        player: general,
        pickNumber: 2,
      },
    ]

    const results = []

    // --------------------------------------------------
    // 5. Create/update both automatic picks
    // --------------------------------------------------

    for (const automatic of automaticPlayers) {
      const player = automatic.player
      const automaticTeam =
        player.automatic_team

      // Find this player's automatic-team game
      const game = games.find(
        (candidate) =>
          matchesAutomaticTeam(
            candidate.home_team,
            automaticTeam
          ) ||
          matchesAutomaticTeam(
            candidate.away_team,
            automaticTeam
          )
      )

      if (!game) {
        results.push({
          player: player.name,
          team: automaticTeam,
          status: 'game-not-found',
        })

        continue
      }

      // Determine the exact API team name
      const actualTeam =
        matchesAutomaticTeam(
          game.home_team,
          automaticTeam
        )
          ? game.home_team
          : game.away_team

      // Get latest DraftKings spread
      const { data: odds, error: oddsError } =
        await supabase
          .from('odds')
          .select(
            `
            spread,
            price,
            fetched_at
            `
          )
          .eq('game_id', game.id)
          .eq('team', actualTeam)
          .eq(
            'sportsbook',
            'DraftKings'
          )
          .eq('market', 'spreads')
          .order(
            'fetched_at',
            { ascending: false }
          )
          .limit(1)

      if (oddsError || !odds?.length) {
        results.push({
          player: player.name,
          team: actualTeam,
          status: 'line-not-found',
        })

        continue
      }

      const latestSpread =
        Number(odds[0].spread)

      // ------------------------------------------------
      // Lock time = exactly 1 hour before kickoff
      // ------------------------------------------------

      const kickoff =
        new Date(game.start_time)

      const lockTime =
        new Date(
          kickoff.getTime() -
            60 * 60 * 1000
        )

      const now = new Date()

      const shouldLock =
        now >= lockTime

      // ------------------------------------------------
      // See whether automatic pick already exists
      // ------------------------------------------------

      const {
        data: existingPick,
        error: existingError,
      } = await supabase
        .from('picks')
        .select(
          `
          id,
          spread,
          locked_spread,
          line_locked
          `
        )
        .eq('week_id', week.id)
        .eq('player_id', player.id)
        .eq('is_automatic', true)
        .maybeSingle()

      if (existingError) {
        throw new Error(
          existingError.message
        )
      }

      // ------------------------------------------------
      // Existing automatic pick
      // ------------------------------------------------

      if (existingPick) {
        // Once locked, NEVER alter the official line.
        if (existingPick.line_locked) {
          results.push({
            player: player.name,
            team: actualTeam,
            spread:
              existingPick.locked_spread,
            status: 'already-locked',
          })

          continue
        }

        const updateData = shouldLock
          ? {
              spread: latestSpread,
              locked_spread:
                latestSpread,
              line_locked: true,
              lock_time:
                lockTime.toISOString(),
            }
          : {
              // Before lock time, keep refreshing
              // the displayed/current line.
              spread: latestSpread,
              lock_time:
                lockTime.toISOString(),
            }

        const { error: updateError } =
          await supabase
            .from('picks')
            .update(updateData)
            .eq('id', existingPick.id)

        if (updateError) {
          throw new Error(
            updateError.message
          )
        }

        results.push({
          player: player.name,
          team: actualTeam,
          spread: latestSpread,
          lockTime:
            lockTime.toISOString(),
          status: shouldLock
            ? 'locked'
            : 'updated',
        })

        continue
      }

      // ------------------------------------------------
      // Create automatic pick
      // ------------------------------------------------

      const { error: insertError } =
        await supabase
          .from('picks')
          .insert({
            week_id: week.id,
            player_id: player.id,
            game_id: game.id,

            pick_number:
              automatic.pickNumber,

            team: actualTeam,

            // Current DraftKings line
            spread: latestSpread,

            sportsbook: 'DraftKings',

            is_automatic: true,

            result: 'pending',

            lock_time:
              lockTime.toISOString(),

            line_locked:
              shouldLock,

            locked_spread:
              shouldLock
                ? latestSpread
                : null,
          })

      if (insertError) {
        throw new Error(
          insertError.message
        )
      }

      results.push({
        player: player.name,
        team: actualTeam,
        spread: latestSpread,
        lockTime:
          lockTime.toISOString(),
        status: shouldLock
          ? 'created-and-locked'
          : 'created',
      })
    }

    return NextResponse.json({
      success: true,
      season: season.year,
      week: week.week_number,
      automaticPicks: results,
    })
  } catch (error) {
    console.error(
      'Automatic picks error:',
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