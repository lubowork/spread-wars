import { redirect } from 'next/navigation'
import { createClient } from '../lib/supabase-server'
import { createAdminClient } from '../lib/supabase-admin'
import DraftBoard from './components/DraftBoard'
import NotificationButton from './components/NotificationButton'

type Player = {
  id: string
  name: string
  automatic_team: string
}

type Pick = {
  id: string
  week_id: string
  player_id: string
  game_id: string
  pick_number: number
  team: string
  spread: number
  sportsbook: string
  is_automatic: boolean
  result: string
  locked_at: string | null
  lock_time: string | null
  locked_spread: number | null
  line_locked: boolean
}

type Game = {
  id: string
  external_game_id: string
  home_team: string
  away_team: string
  start_time: string
  completed: boolean
}

type Odd = {
  game_id: string
  team: string
  spread: number
  price: number | null
  fetched_at: string
}

type DraftGame = {
  id: string
  home_team: string
  away_team: string
  start_time: string
  odds: {
    team: string
    spread: number
    price: number | null
    fetched_at: string
  }[]
}

type ApprovedAdjustment = {
  target_player_id: string
  wins_delta: number
  losses_delta: number
  pushes_delta: number
}

function calculateRecord(
  playerId: string,
  picks: Pick[],
  adjustments: ApprovedAdjustment[]
) {
  const playerPicks =
    picks.filter(
      (pick) =>
        pick.player_id === playerId
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

  const playerAdjustments =
    adjustments.filter(
      (adjustment) =>
        adjustment.target_player_id ===
        playerId
    )

  for (
    const adjustment of
    playerAdjustments
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

function formatSpread(
  spread: number
) {
  if (spread > 0) {
    return `+${spread}`
  }

  return `${spread}`
}

export default async function HomePage() {
  // --------------------------------------------------
  // AUTH
  // --------------------------------------------------

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
      automatic_team
    `)
    .eq(
      'auth_user_id',
      user.id
    )
    .maybeSingle()

  if (
    loggedInPlayerError ||
    !loggedInPlayer
  ) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">

          <h1 className="text-3xl font-black">
            Spread Wars
          </h1>

          <div className="mt-6 rounded-2xl border border-red-900 bg-red-950/40 p-6 text-red-200">
            Your login is not linked to a Spread Wars player.
          </div>

        </div>
      </main>
    )
  }

  // --------------------------------------------------
  // PLAYERS
  // --------------------------------------------------

  const {
    data: playersData,
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

  const players =
    (playersData ?? []) as Player[]

  // --------------------------------------------------
  // ACTIVE WEEK
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

  if (!week) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">

        <div className="mx-auto max-w-5xl">

          <div className="flex flex-wrap items-center justify-between gap-4">

            <div>
              <h1 className="text-4xl font-black">
                Spread Wars
              </h1>

              <p className="mt-1 text-slate-400">
                College Football
              </p>
            </div>

            <form
              action="/auth/signout"
              method="post"
            >
              <button
                type="submit"
                className="rounded-xl border border-slate-700 px-4 py-2 font-bold text-slate-300"
              >
                Sign Out
              </button>
            </form>

          </div>

          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            No active week is currently available.
          </div>

        </div>

      </main>
    )
  }

  // --------------------------------------------------
  // SEASON
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
    .single()

  if (seasonError) {
    throw new Error(
      seasonError.message
    )
  }

  // --------------------------------------------------
  // PICKS
  // --------------------------------------------------

  const {
    data: picksData,
    error: picksError,
  } = await supabase
    .from('picks')
    .select(`
      id,
      week_id,
      player_id,
      game_id,
      pick_number,
      team,
      spread,
      sportsbook,
      is_automatic,
      result,
      locked_at,
      lock_time,
      locked_spread,
      line_locked
    `)
    .eq(
      'week_id',
      week.id
    )
    .order(
      'pick_number',
      {
        ascending: true,
      }
    )

  if (picksError) {
    throw new Error(
      picksError.message
    )
  }

  const picks =
    (picksData ?? []) as Pick[]

  // --------------------------------------------------
  // APPROVED ADJUSTMENTS
  // --------------------------------------------------

  const {
    data: adjustmentsData,
    error: adjustmentsError,
  } = await supabase
    .from('result_adjustments')
    .select(`
      target_player_id,
      wins_delta,
      losses_delta,
      pushes_delta
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

  const adjustments =
    (adjustmentsData ??
      []) as ApprovedAdjustment[]

  // --------------------------------------------------
  // GAMES INSIDE ACTIVE WEEK WINDOW
  // --------------------------------------------------

  let gamesQuery =
    supabase
      .from('games')
      .select(`
        id,
        external_game_id,
        home_team,
        away_team,
        start_time,
        completed
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
        new Date().toISOString()
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
    data: gamesData,
    error: gamesError,
  } =
    await gamesQuery.order(
      'start_time',
      {
        ascending: true,
      }
    )

  if (gamesError) {
    throw new Error(
      gamesError.message
    )
  }

  const allGames =
    (gamesData ?? []) as Game[]

  // --------------------------------------------------
  // REMOVE GAMES THAT HAVE ALREADY STARTED
  //
  // DraftBoard separately removes drafted games.
  // --------------------------------------------------

  const now =
    Date.now()

  const futureGames =
    allGames.filter(
      (game) =>
        new Date(
          game.start_time
        ).getTime() > now
    )

  // --------------------------------------------------
  // LOAD DRAFTKINGS ODDS FOR THOSE GAMES
  // --------------------------------------------------

  const futureGameIds =
    futureGames.map(
      (game) =>
        game.id
    )

  let odds: Odd[] = []

  if (
    futureGameIds.length > 0
  ) {
    const {
      data: oddsData,
      error: oddsError,
    } = await supabase
      .from('odds')
      .select(`
        game_id,
        team,
        spread,
        price,
        fetched_at
      `)
      .in(
        'game_id',
        futureGameIds
      )
      .eq(
        'sportsbook',
        'DraftKings'
      )
      .eq(
        'market',
        'spreads'
      )
      .order(
        'fetched_at',
        {
          ascending: false,
        }
      )

    if (oddsError) {
      throw new Error(
        oddsError.message
      )
    }

    odds =
      (oddsData ?? []) as Odd[]
  }

  // --------------------------------------------------
  // BUILD EXACT GAME SHAPE DRAFTBOARD EXPECTS
  //
  // DraftBoard expects:
  //
  // {
  //   id,
  //   home_team,
  //   away_team,
  //   start_time,
  //   odds: [...]
  // }
  // --------------------------------------------------

  const draftGames: DraftGame[] =
    futureGames.map(
      (game) => ({
        id:
          game.id,

        home_team:
          game.home_team,

        away_team:
          game.away_team,

        start_time:
          game.start_time,

        odds:
          odds
            .filter(
              (odd) =>
                odd.game_id ===
                game.id
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
                  odd.price === null
                    ? null
                    : Number(
                        odd.price
                      ),

                fetched_at:
                  odd.fetched_at,
              })
            ),
      })
    )

  // --------------------------------------------------
  // CURRENT TURN
  // --------------------------------------------------

  const normalPicks =
    picks.filter(
      (pick) =>
        !pick.is_automatic
    )

  let currentTurnPlayerId =
    week.first_picker_id

  if (
    players.length === 2 &&
    normalPicks.length % 2 === 1
  ) {
    const otherPlayer =
      players.find(
        (player) =>
          player.id !==
          week.first_picker_id
      )

    if (otherPlayer) {
      currentTurnPlayerId =
        otherPlayer.id
    }
  }

  const currentTurnPlayer =
    players.find(
      (player) =>
        player.id ===
        currentTurnPlayerId
    )

  // --------------------------------------------------
  // WEEK RECORDS
  // --------------------------------------------------

  const playerRecords =
    players.map(
      (player) => ({
        player,

        record:
          calculateRecord(
            player.id,
            picks,
            adjustments
          ),
      })
    )

  // --------------------------------------------------
  // AUTOMATIC PICKS
  // --------------------------------------------------

  const automaticPicks =
    picks.filter(
      (pick) =>
        pick.is_automatic
    )

  function automaticPickForPlayer(
    playerId: string
  ) {
    return automaticPicks.find(
      (pick) =>
        pick.player_id ===
        playerId
    )
  }

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">

      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <header className="mb-8">

          <div className="flex flex-wrap items-start justify-between gap-5">

            <div>

              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                Spread Wars
              </h1>

              <p className="mt-2 text-slate-400">
                College Football · DraftKings Spreads
              </p>

              <p className="mt-1 text-sm font-bold text-cyan-400">
                {season.year} · Week{' '}
                {week.week_number}
              </p>

            </div>

            <div className="flex flex-wrap items-center gap-2">

              <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2">

                <div className="text-xs uppercase text-slate-500">
                  Signed In
                </div>

                <div className="font-black text-emerald-400">
                  {
                    loggedInPlayer.name
                  }
                </div>

              </div>

              <NotificationButton />

              <a
                href="/admin"
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold hover:bg-slate-800"
              >
                Admin
              </a>

              <form
                action="/auth/signout"
                method="post"
              >
                <button
                  type="submit"
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold hover:bg-slate-800"
                >
                  Sign Out
                </button>
              </form>

            </div>

          </div>

        </header>

        {/* WEEK WINDOW WARNING */}

        {(
          !week.starts_at ||
          !week.ends_at
        ) && (
          <div className="mb-6 rounded-2xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">
            This week does not have a complete game window configured. Set the week start and end times in Admin.
          </div>
        )}

        {/* RECORD CARDS */}

        <section className="mb-6 grid gap-4 sm:grid-cols-2">

          {playerRecords.map(
            ({
              player,
              record,
            }) => (
              <div
                key={
                  player.id
                }
                className={`rounded-2xl border p-5 ${
                  currentTurnPlayerId ===
                  player.id
                    ? 'border-cyan-500 bg-cyan-950/30'
                    : 'border-slate-800 bg-slate-900'
                }`}
              >

                <div className="flex items-start justify-between gap-4">

                  <div>

                    <div className="text-2xl font-black">
                      {
                        player.name
                      }
                    </div>

                    <div className="mt-1 text-sm text-slate-400">
                      Auto:{' '}
                      {
                        player.automatic_team
                      }
                    </div>

                  </div>

                  {currentTurnPlayerId ===
                    player.id && (
                    <div className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-black uppercase text-slate-950">
                      On the clock
                    </div>
                  )}

                </div>

                <div className="mt-5 text-3xl font-black">
                  {
                    record.wins
                  }
                  -
                  {
                    record.losses
                  }
                  -
                  {
                    record.pushes
                  }
                </div>

                <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                  W-L-P
                </div>

              </div>
            )
          )}

        </section>

        {/* MAIN GRID */}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">

          {/* DRAFT BOARD */}

          <section>

            <div className="mb-4">

              <h2 className="text-2xl font-black">
                Draft Board
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                {currentTurnPlayer
                  ? `${currentTurnPlayer.name}'s turn`
                  : 'Current turn unavailable'}
              </p>

            </div>

            <DraftBoard
              players={
                players
              }
              games={
                draftGames
              }
              picks={
                picks
              }
              weekId={
                week.id
              }
              firstPickerId={
                week.first_picker_id
              }
              loggedInPlayerId={
                loggedInPlayer.id
              }
            />

          </section>

          {/* SIDEBAR */}

          <aside className="space-y-6">

            {/* AUTOMATIC PICKS */}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">

              <h2 className="text-xl font-black">
                Automatic Picks
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Picks #1 and #2. Lines lock exactly one hour before kickoff.
              </p>

              <div className="mt-5 space-y-4">

                {players.map(
                  (player) => {
                    const pick =
                      automaticPickForPlayer(
                        player.id
                      )

                    return (
                      <div
                        key={
                          player.id
                        }
                        className="rounded-xl bg-slate-800 p-4"
                      >

                        <div className="text-sm text-slate-400">
                          {
                            player.name
                          }
                        </div>

                        <div className="mt-1 font-black">
                          {pick
                            ? pick.team
                            : player.automatic_team}
                        </div>

                        {pick ? (
                          <>
                            <div className="mt-1 text-lg font-black text-cyan-400">
                              {formatSpread(
                                Number(
                                  pick.spread
                                )
                              )}
                            </div>

                            <div className="mt-2 text-xs font-bold uppercase">

                              {pick.line_locked ? (
                                <span className="text-emerald-400">
                                  Locked
                                </span>
                              ) : (
                                <span className="text-amber-400">
                                  Current line
                                </span>
                              )}

                            </div>
                          </>
                        ) : (
                          <div className="mt-2 text-sm text-slate-500">
                            Waiting for DraftKings line
                          </div>
                        )}

                      </div>
                    )
                  }
                )}

              </div>

            </section>

            {/* WEEK STATUS */}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">

              <h2 className="text-xl font-black">
                Week Status
              </h2>

              <div className="mt-4 space-y-3 text-sm">

                <div className="flex justify-between gap-4">

                  <span className="text-slate-400">
                    Week
                  </span>

                  <strong>
                    {
                      week.week_number
                    }
                  </strong>

                </div>

                <div className="flex justify-between gap-4">

                  <span className="text-slate-400">
                    First normal pick
                  </span>

                  <strong>
                    {
                      players.find(
                        (player) =>
                          player.id ===
                          week.first_picker_id
                      )?.name ??
                      '—'
                    }
                  </strong>

                </div>

                <div className="flex justify-between gap-4">

                  <span className="text-slate-400">
                    Normal picks
                  </span>

                  <strong>
                    {
                      normalPicks.length
                    }
                  </strong>

                </div>

                <div className="flex justify-between gap-4">

                  <span className="text-slate-400">
                    Current turn
                  </span>

                  <strong className="text-cyan-400">
                    {
                      currentTurnPlayer?.name ??
                      '—'
                    }
                  </strong>

                </div>

              </div>

            </section>

            {/* APPROVED ADJUSTMENTS */}

            {adjustments.length >
              0 && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">

                <h2 className="text-xl font-black">
                  Approved Adjustments
                </h2>

                <div className="mt-4 space-y-3">

                  {adjustments.map(
                    (
                      adjustment,
                      index
                    ) => (
                      <div
                        key={
                          `${adjustment.target_player_id}-${index}`
                        }
                        className="rounded-xl bg-slate-800 p-3 text-sm"
                      >

                        <div className="font-bold">
                          {
                            players.find(
                              (player) =>
                                player.id ===
                                adjustment.target_player_id
                            )?.name ??
                            'Unknown'
                          }
                        </div>

                        <div className="mt-1 text-slate-400">

                          W{' '}
                          {adjustment.wins_delta >=
                          0
                            ? '+'
                            : ''}
                          {
                            adjustment.wins_delta
                          }

                          {' · '}

                          L{' '}
                          {adjustment.losses_delta >=
                          0
                            ? '+'
                            : ''}
                          {
                            adjustment.losses_delta
                          }

                          {' · '}

                          P{' '}
                          {adjustment.pushes_delta >=
                          0
                            ? '+'
                            : ''}
                          {
                            adjustment.pushes_delta
                          }

                        </div>

                      </div>
                    )
                  )}

                </div>

              </section>
            )}

            {/* RULES */}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">

              <h2 className="text-xl font-black">
                Rules
              </h2>

              <div className="mt-4 space-y-3 text-sm text-slate-400">

                <p>
                  Geoff automatically receives Penn State.
                </p>

                <p>
                  General automatically receives Miami.
                </p>

                <p>
                  Automatic picks are Picks #1 and #2.
                </p>

                <p>
                  Normal drafting starts with Pick #3.
                </p>

                <p>
                  Selecting either side removes the entire game from the draft.
                </p>

                <p>
                  Normal picks lock immediately when selected.
                </p>

                <p>
                  Automatic lines lock exactly one hour before kickoff.
                </p>

              </div>

            </section>

          </aside>

        </div>

      </div>

    </main>
  )
}