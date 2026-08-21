import { redirect } from 'next/navigation'
import { createAdminClient } from '../lib/supabase-admin'
import { createClient } from '../lib/supabase-server'

import DraftBoard from './components/DraftBoard'
import NotificationButton from './components/NotificationButton'
import TestNotificationButton from './components/TestNotificationButton'

export default async function Home() {
  const authSupabase =
    await createClient()

  const {
    data: { user },
  } =
    await authSupabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const supabase =
    createAdminClient()

  // --------------------------------------------------
  // LOGGED-IN PLAYER
  // --------------------------------------------------

  const {
    data: loggedInPlayer,
    error: loggedInPlayerError,
  } = await supabase
    .from('players')
    .select(`
      id,
      name,
      automatic_team,
      phone_number,
      auth_user_id
    `)
    .eq(
      'auth_user_id',
      user.id
    )
    .maybeSingle()

  if (loggedInPlayerError) {
    throw new Error(
      loggedInPlayerError.message
    )
  }

  if (!loggedInPlayer) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-black">
          Spread Wars
        </h1>

        <p className="mt-4 text-red-400">
          Your login is not linked to a Spread Wars player.
        </p>

        <form
          action="/auth/signout"
          method="post"
          className="mt-6"
        >
          <button
            type="submit"
            className="rounded-xl bg-slate-800 px-4 py-3 font-bold"
          >
            Sign Out
          </button>
        </form>
      </main>
    )
  }

  // --------------------------------------------------
  // PLAYERS
  // --------------------------------------------------

  const {
    data: players,
    error: playersError,
  } = await supabase
    .from('players')
    .select(`
      id,
      name,
      automatic_team
    `)
    .order('name')

  if (playersError) {
    throw new Error(
      playersError.message
    )
  }

  // --------------------------------------------------
  // CURRENT ACTIVE WEEK
  //
  // No hardcoded season or week number.
  // --------------------------------------------------

  const {
    data: week,
    error: weekError,
  } = await supabase
    .from('weeks')
    .select(`
      id,
      season_id,
      week_number,
      first_picker_id,
      status,
      starts_at,
      ends_at
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

  if (!players || !week) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-black">
          Spread Wars
        </h1>

        <p className="mt-4 text-red-400">
          No active Spread Wars week was found.
        </p>
      </main>
    )
  }

  // --------------------------------------------------
  // SEASON FOR ACTIVE WEEK
  // --------------------------------------------------

  const {
    data: season,
    error: seasonError,
  } = await supabase
    .from('seasons')
    .select(`
      id,
      year
    `)
    .eq(
      'id',
      week.season_id
    )
    .maybeSingle()

  if (seasonError) {
    throw new Error(
      seasonError.message
    )
  }

  // --------------------------------------------------
  // PICKS
  // --------------------------------------------------

  const {
    data: picks,
    error: picksError,
  } = await supabase
    .from('picks')
    .select(`
      id,
      pick_number,
      player_id,
      game_id,
      team,
      spread,
      is_automatic,
      result
    `)
    .eq(
      'week_id',
      week.id
    )
    .order(
      'pick_number'
    )

  if (picksError) {
    throw new Error(
      picksError.message
    )
  }

  // --------------------------------------------------
  // APPROVED ADJUSTMENTS
  // --------------------------------------------------

  const {
    data: adjustments,
    error: adjustmentsError,
  } = await supabase
    .from('result_adjustments')
    .select(`
      id,
      target_player_id,
      wins_delta,
      losses_delta,
      pushes_delta,
      status
    `)
    .eq(
      'week_id',
      week.id
    )
    .eq(
      'status',
      'approved'
    )

  if (adjustmentsError) {
    throw new Error(
      adjustmentsError.message
    )
  }

  // --------------------------------------------------
  // WEEKLY RECORD
  // --------------------------------------------------

  function getRecordForPlayer(
    playerId: string
  ) {
    const playerPicks =
      (picks ?? []).filter(
        (pick) =>
          pick.player_id ===
          playerId
      )

    let wins =
      playerPicks.filter(
        (pick) =>
          pick.result === 'win'
      ).length

    let losses =
      playerPicks.filter(
        (pick) =>
          pick.result === 'loss'
      ).length

    let pushes =
      playerPicks.filter(
        (pick) =>
          pick.result === 'push'
      ).length

    const approvedAdjustments =
      (adjustments ?? []).filter(
        (adjustment) =>
          adjustment.target_player_id ===
          playerId
      )

    for (
      const adjustment of
      approvedAdjustments
    ) {
      wins +=
        Number(
          adjustment.wins_delta
        ) || 0

      losses +=
        Number(
          adjustment.losses_delta
        ) || 0

      pushes +=
        Number(
          adjustment.pushes_delta
        ) || 0
    }

    return {
      wins,
      losses,
      pushes,
    }
  }

  // --------------------------------------------------
  // PICKED GAME IDS
  // --------------------------------------------------

  const pickedGameIds =
    new Set(
      (picks ?? []).map(
        (pick) =>
          pick.game_id
      )
    )

  // --------------------------------------------------
  // ACTIVE WEEK GAME WINDOW
  //
  // If dates are filled in:
  // only show games inside the week.
  //
  // If dates are temporarily blank:
  // fall back to future games.
  // --------------------------------------------------

  const now =
    new Date().toISOString()

  let gamesQuery =
    supabase
      .from('games')
      .select(`
        id,
        home_team,
        away_team,
        start_time,
        odds (
          team,
          spread,
          price,
          sportsbook,
          market,
          fetched_at
        )
      `)
      .eq(
        'completed',
        false
      )

  if (week.starts_at) {
    gamesQuery =
      gamesQuery.gte(
        'start_time',
        week.starts_at
      )
  } else {
    gamesQuery =
      gamesQuery.gte(
        'start_time',
        now
      )
  }

  if (week.ends_at) {
    gamesQuery =
      gamesQuery.lt(
        'start_time',
        week.ends_at
      )
  }

  const {
    data: games,
    error: gamesError,
  } =
    await gamesQuery.order(
      'start_time'
    )

  if (gamesError) {
    throw new Error(
      gamesError.message
    )
  }

  // --------------------------------------------------
  // AVAILABLE GAMES
  // --------------------------------------------------

  const gamesWithOdds =
    (games ?? [])
      .filter(
        (game) =>
          !pickedGameIds.has(
            game.id
          )
      )
      .map(
        (game) => ({
          ...game,

          odds:
            (game.odds ?? [])
              .filter(
                (odd) =>
                  odd.sportsbook ===
                    'DraftKings' &&
                  odd.market ===
                    'spreads'
              )
              .map(
                (odd) => ({
                  team:
                    odd.team,

                  spread:
                    Number(
                      odd.spread
                    ),

                  price:
                    odd.price,

                  fetched_at:
                    odd.fetched_at,
                })
              ),
        })
      )

  // --------------------------------------------------
  // NORMAL PICKS
  // --------------------------------------------------

  const normalPicks =
    (picks ?? []).filter(
      (pick) =>
        !pick.is_automatic
    )

  // --------------------------------------------------
  // CURRENT TURN
  // --------------------------------------------------

  const firstPicker =
    players.find(
      (player) =>
        player.id ===
        week.first_picker_id
    )

  const secondPicker =
    players.find(
      (player) =>
        player.id !==
        week.first_picker_id
    )

  const nextPickNumber =
    normalPicks.length + 3

  const currentPlayer =
    normalPicks.length % 2 === 0
      ? firstPicker
      : secondPicker

  const isMyTurn =
    currentPlayer?.id ===
    loggedInPlayer.id

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-slate-950 text-white">

      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* HEADER */}

        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">

          <div>
            <h1 className="text-4xl font-black tracking-tight">
              Spread Wars
            </h1>

            <p className="mt-1 text-slate-400">
              Geoff vs. General · College Football · Spread Only
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">

            <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Signed In
              </div>

              <div className="font-bold text-emerald-400">
                {loggedInPlayer.name}
              </div>
            </div>

            <NotificationButton />

            <TestNotificationButton />

            <a
              href="/admin"
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800"
            >
              Admin
            </a>

            <form
              action="/auth/signout"
              method="post"
            >
              <button
                type="submit"
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800"
              >
                Sign Out
              </button>
            </form>

            <div className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-3">

              <div className="text-xs uppercase tracking-wide text-slate-500">
                Season
              </div>

              <div className="text-xl font-bold">
                {season?.year ?? '—'}

                <span className="mx-2 text-slate-600">
                  ·
                </span>

                Week {week.week_number}
              </div>

            </div>

          </div>

        </header>

        {/* WEEK WINDOW WARNING */}

        {(!week.starts_at ||
          !week.ends_at) && (
          <div className="mb-6 rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-sm text-amber-300">
            This week does not yet have a complete game window configured.
          </div>
        )}

        {/* TURN MESSAGE */}

        <div
          className={`mb-8 rounded-2xl border p-5 ${
            isMyTurn
              ? 'border-emerald-500/50 bg-emerald-950/30'
              : 'border-slate-800 bg-slate-900'
          }`}
        >
          {isMyTurn ? (
            <>
              <div className="text-sm font-bold uppercase tracking-wide text-emerald-400">
                Your Turn
              </div>

              <div className="mt-1 text-2xl font-black">
                Pick #{nextPickNumber}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Waiting
              </div>

              <div className="mt-1 text-xl font-bold">
                {currentPlayer?.name ?? '—'} is on the clock
              </div>
            </>
          )}
        </div>

        {/* WEEKLY SCOREBOARD */}

        <div className="mb-8 grid gap-4 md:grid-cols-2">

          {players.map(
            (player) => {
              const record =
                getRecordForPlayer(
                  player.id
                )

              return (
                <div
                  key={
                    player.id
                  }
                  className={`rounded-2xl border p-5 ${
                    currentPlayer?.id ===
                    player.id
                      ? 'border-emerald-500/50 bg-emerald-950/20'
                      : 'border-slate-800 bg-slate-900'
                  }`}
                >

                  <div className="flex items-center justify-between">

                    <div>

                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        {
                          player.automatic_team
                        }
                      </div>

                      <div className="mt-1 text-2xl font-black">
                        {
                          player.name
                        }
                      </div>

                    </div>

                    {currentPlayer?.id ===
                      player.id && (
                      <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
                        ON THE CLOCK
                      </div>
                    )}

                  </div>

                  <div className="mt-4 text-sm text-slate-500">
                    Weekly Record
                  </div>

                  <div className="text-3xl font-black">

                    {record.wins}–
                    {record.losses}

                    {record.pushes >
                    0
                      ? `–${record.pushes}`
                      : ''}

                  </div>

                </div>
              )
            }
          )}

        </div>

        {/* MAIN GRID */}

        <div className="grid gap-6 lg:grid-cols-3">

          <DraftBoard
            players={
              players
            }

            games={
              gamesWithOdds
            }

            loggedInPlayerId={
              loggedInPlayer.id
            }

            picks={
              (picks ?? []).map(
                (pick) => ({
                  ...pick,

                  spread:
                    Number(
                      pick.spread
                    ),
                })
              )
            }

            weekId={
              week.id
            }

            firstPickerId={
              week.first_picker_id
            }
          />

          <aside className="space-y-6">

            {/* AUTOMATIC PICKS */}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

              <h2 className="mb-5 text-xl font-bold">
                Automatic Picks
              </h2>

              <div className="space-y-3">

                {(picks ?? [])
                  .filter(
                    (pick) =>
                      pick.is_automatic
                  )
                  .sort(
                    (a, b) =>
                      a.pick_number -
                      b.pick_number
                  )
                  .map(
                    (pick) => {
                      const player =
                        players.find(
                          (p) =>
                            p.id ===
                            pick.player_id
                        )

                      return (
                        <div
                          key={
                            pick.id
                          }
                          className="rounded-xl bg-slate-800 p-4"
                        >

                          <div className="flex items-center justify-between">

                            <div>

                              <div className="font-bold">
                                {
                                  player?.name
                                }
                              </div>

                              <div className="text-sm text-slate-400">
                                {
                                  pick.team
                                }
                              </div>

                            </div>

                            <div className="text-right">

                              <div className="text-xs text-slate-500">
                                AUTO
                              </div>

                              <div className="text-xl font-black text-cyan-300">

                                {Number(
                                  pick.spread
                                ) > 0
                                  ? `+${pick.spread}`
                                  : pick.spread}

                              </div>

                            </div>

                          </div>

                        </div>
                      )
                    }
                  )}

              </div>

            </section>

            {/* DRAFT STATUS */}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

              <h2 className="mb-5 text-xl font-bold">
                Draft Status
              </h2>

              <div className="space-y-3">

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Next Pick
                  </span>

                  <strong>
                    #{nextPickNumber}
                  </strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    On the Clock
                  </span>

                  <strong>
                    {
                      currentPlayer?.name ??
                      '—'
                    }
                  </strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Available Games
                  </span>

                  <strong>
                    {
                      gamesWithOdds.length
                    }
                  </strong>
                </div>

              </div>

            </section>

            {/* APPROVED ADJUSTMENTS */}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

              <h2 className="mb-5 text-xl font-bold">
                Approved Adjustments
              </h2>

              {(adjustments ?? [])
                .length === 0 ? (
                <div className="text-sm text-slate-500">
                  No approved record adjustments this week.
                </div>
              ) : (
                <div className="space-y-3">

                  {(adjustments ?? []).map(
                    (
                      adjustment
                    ) => {
                      const player =
                        players.find(
                          (p) =>
                            p.id ===
                            adjustment.target_player_id
                        )

                      return (
                        <div
                          key={
                            adjustment.id
                          }
                          className="rounded-xl bg-slate-800 p-4"
                        >

                          <div className="font-bold">
                            {
                              player?.name
                            }
                          </div>

                          <div className="mt-2 text-sm text-slate-400">
                            Wins{' '}
                            {Number(
                              adjustment.wins_delta
                            ) >= 0
                              ? '+'
                              : ''}
                            {
                              adjustment.wins_delta
                            }

                            {' · '}

                            Losses{' '}
                            {Number(
                              adjustment.losses_delta
                            ) >= 0
                              ? '+'
                              : ''}
                            {
                              adjustment.losses_delta
                            }

                            {' · '}

                            Pushes{' '}
                            {Number(
                              adjustment.pushes_delta
                            ) >= 0
                              ? '+'
                              : ''}
                            {
                              adjustment.pushes_delta
                            }
                          </div>

                        </div>
                      )
                    }
                  )}

                </div>
              )}

            </section>

            {/* RULES */}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

              <h2 className="mb-5 text-xl font-bold">
                Rules
              </h2>

              <div className="space-y-3 text-sm">

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Sport
                  </span>

                  <strong>
                    College Football
                  </strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Market
                  </span>

                  <strong>
                    Spread Only
                  </strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Sportsbook
                  </span>

                  <strong>
                    DraftKings
                  </strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Pick #1
                  </span>

                  <strong>
                    Geoff · Penn State
                  </strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Pick #2
                  </span>

                  <strong>
                    General · Miami
                  </strong>
                </div>

                <div className="border-t border-slate-800 pt-3">
                  <div className="text-slate-500">
                    Automatic Line
                  </div>

                  <div className="mt-1">
                    Penn State and Miami lock one hour before kickoff.
                  </div>
                </div>

              </div>

            </section>

          </aside>

        </div>

      </div>

    </main>
  )
}