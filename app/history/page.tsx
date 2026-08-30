import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import { createAdminClient } from '../../lib/supabase-admin'

type Player = {
  id: string
  name: string
}

type Week = {
  id: string
  week_number: number
  first_picker_id: string
  status: string
  starts_at: string | null
  ends_at: string | null
}

type Game = {
  id: string
  home_team: string
  away_team: string
  completed: boolean
  home_score: number | null
  away_score: number | null
}

type Pick = {
  id: string
  week_id: string
  player_id: string
  game_id: string
  pick_number: number
  team: string
  spread: number
  is_automatic: boolean
  result: string
}

type Adjustment = {
  week_id: string
  target_player_id: string
  wins_delta: number
  losses_delta: number
  pushes_delta: number
}

type Record = {
  wins: number
  losses: number
  pushes: number
}

type Standing = {
  player: Player
  wins: number
  losses: number
  pushes: number
  percentage: number
}

const STARTING_GENERAL_LEAD = 20

function formatSpread(
  spread: number
) {
  if (spread > 0) {
    return `+${spread}`
  }

  if (spread === 0) {
    return 'PK'
  }

  return `${spread}`
}

function resultBadgeClasses(
  result: string
) {
  if (result === 'win') {
    return 'border border-emerald-700 bg-emerald-950 text-emerald-300'
  }

  if (result === 'loss') {
    return 'border border-red-700 bg-red-950 text-red-300'
  }

  if (result === 'push') {
    return 'border border-amber-700 bg-amber-950 text-amber-300'
  }

  return 'border border-slate-700 bg-slate-800 text-slate-300'
}

function perspectiveCardClasses(
  pick: Pick | undefined,
  loggedInPlayerId: string
) {
  if (
    !pick ||
    pick.result === 'pending' ||
    pick.result === 'push'
  ) {
    return 'border-slate-700 bg-slate-950/70'
  }

  const isMyPick =
    pick.player_id === loggedInPlayerId

  const goodForMe =
    (isMyPick && pick.result === 'win') ||
    (!isMyPick && pick.result === 'loss')

  if (goodForMe) {
    return 'border-emerald-600 bg-emerald-950/35'
  }

  return 'border-red-700 bg-red-950/35'
}

function getGameForPick(
  pick: Pick,
  games: Game[]
) {
  return games.find(
    (game) =>
      game.id === pick.game_id
  )
}

function getOpponentTeam(
  pick: Pick,
  game: Game | undefined
) {
  if (!game) {
    return null
  }

  if (pick.team === game.home_team) {
    return game.away_team
  }

  if (pick.team === game.away_team) {
    return game.home_team
  }

  return null
}

function getScoreForTeam(
  game: Game | undefined,
  team: string | null
) {
  if (
    !game ||
    !team ||
    !game.completed
  ) {
    return null
  }

  if (team === game.home_team) {
    return game.home_score
  }

  if (team === game.away_team) {
    return game.away_score
  }

  return null
}

function calculateHeadToHeadRecord(
  playerId: string,
  allPlayers: Player[],
  relevantPicks: Pick[],
  relevantAdjustments: Adjustment[]
): Record {
  let wins = 0
  let losses = 0
  let pushes = 0

  for (const pick of relevantPicks) {
    if (pick.result === 'pending') {
      continue
    }

    if (pick.result === 'push') {
      pushes++
      continue
    }

    const isMyPick =
      pick.player_id === playerId

    if (isMyPick) {
      if (pick.result === 'win') {
        wins++
      } else if (pick.result === 'loss') {
        losses++
      }

      continue
    }

    if (pick.result === 'win') {
      losses++
    } else if (pick.result === 'loss') {
      wins++
    }
  }

  for (const adjustment of relevantAdjustments) {
    const isMyAdjustment =
      adjustment.target_player_id === playerId

    if (isMyAdjustment) {
      wins += Number(adjustment.wins_delta) || 0
      losses += Number(adjustment.losses_delta) || 0
      pushes += Number(adjustment.pushes_delta) || 0
      continue
    }

    const adjustmentPlayerExists =
      allPlayers.some(
        (player) =>
          player.id ===
          adjustment.target_player_id
      )

    if (!adjustmentPlayerExists) {
      continue
    }

    losses += Number(adjustment.wins_delta) || 0
    wins += Number(adjustment.losses_delta) || 0
    pushes += Number(adjustment.pushes_delta) || 0
  }

  return {
    wins,
    losses,
    pushes,
  }
}

function PickMatchupRow({
  player,
  pick,
  games,
  loggedInPlayerId,
  label,
}: {
  player: Player
  pick: Pick
  games: Game[]
  loggedInPlayerId: string
  label: string
}) {
  const game =
    getGameForPick(
      pick,
      games
    )

  const opponentTeam =
    getOpponentTeam(
      pick,
      game
    )

  const selectedSpread =
    Number(pick.spread)

  const opponentSpread =
    selectedSpread === 0
      ? 0
      : selectedSpread * -1

  const pickedTeamScore =
    getScoreForTeam(
      game,
      pick.team
    )

  const opponentScore =
    getScoreForTeam(
      game,
      opponentTeam
    )

  const isYou =
    player.id === loggedInPlayerId

  return (
    <div>
      <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div
        className={`rounded-2xl border p-4 sm:p-5 ${perspectiveCardClasses(
          pick,
          loggedInPlayerId
        )}`}
      >
        {/* TOP BAR */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="text-xs font-black uppercase tracking-wide text-slate-200">
            {isYou
              ? `${player.name} · You`
              : player.name}
          </div>

          <div className="min-w-0 flex-1 text-lg font-black text-white sm:text-xl">
            {pick.team}
          </div>

          <div className="text-2xl font-black text-cyan-300">
            {formatSpread(selectedSpread)}
          </div>

          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Result
          </div>

          <span
            className={`rounded-full px-3 py-1 text-xs font-black uppercase ${resultBadgeClasses(
              pick.result
            )}`}
          >
            {pick.result}
          </span>
        </div>

        {/* SCORE HEADER */}
        <div className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
          Final Score
        </div>

        {/* SCORE BOXES */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {/* PICK SIDE */}
          <div className="rounded-xl bg-black/20 px-3 py-4 sm:px-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Pick
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="break-words text-base font-black text-white sm:text-lg">
                  {pick.team}
                </div>

                <div className="mt-1 text-lg font-black text-cyan-300 sm:text-xl">
                  {formatSpread(selectedSpread)}
                </div>
              </div>

              <div className="shrink-0 text-4xl font-black text-white sm:text-5xl">
                {pickedTeamScore !== null
                  ? pickedTeamScore
                  : '—'}
              </div>
            </div>
          </div>

          {/* OPPONENT SIDE */}
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-4 sm:px-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Opponent
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="break-words text-base font-black text-slate-100 sm:text-lg">
                  {opponentTeam ?? 'Opponent unavailable'}
                </div>

                <div className="mt-1 text-lg font-black text-slate-400 sm:text-xl">
                  {opponentTeam
                    ? formatSpread(opponentSpread)
                    : '—'}
                </div>
              </div>

              <div className="shrink-0 text-4xl font-black text-white sm:text-5xl">
                {opponentScore !== null
                  ? opponentScore
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function HistoryPage() {
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

  const {
    data: loggedInPlayerData,
    error: loggedInPlayerError,
  } = await supabase
    .from('players')
    .select(`
      id,
      name
    `)
    .eq(
      'auth_user_id',
      user.id
    )
    .maybeSingle()

  if (
    loggedInPlayerError ||
    !loggedInPlayerData
  ) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-4xl font-black">
            Season History
          </h1>

          <div className="mt-6 rounded-2xl border border-red-900 bg-red-950/40 p-6 text-red-200">
            Your login is not linked to a Spread Wars player.
          </div>

          <div className="mt-8 pb-8">
            <a
              href="/"
              className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 text-center text-base font-black text-white transition hover:bg-slate-800"
            >
              ← Back to Spread Wars
            </a>
          </div>
        </div>
      </main>
    )
  }

  const loggedInPlayer: Player = {
    id: loggedInPlayerData.id,
    name: loggedInPlayerData.name,
  }

  const {
    data: season,
    error: seasonError,
  } = await supabase
    .from('seasons')
    .select(`
      id,
      year
    `)
    .order('year', {
      ascending: false,
    })
    .limit(1)
    .maybeSingle()

  if (seasonError) {
    throw new Error(
      seasonError.message
    )
  }

  if (!season) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-4xl font-black">
            Season History
          </h1>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
            No season has been created.
          </div>

          <div className="mt-8 pb-8">
            <a
              href="/"
              className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 text-center text-base font-black text-white transition hover:bg-slate-800"
            >
              ← Back to Spread Wars
            </a>
          </div>
        </div>
      </main>
    )
  }

  const {
    data: playersData,
    error: playersError,
  } = await supabase
    .from('players')
    .select(`
      id,
      name
    `)
    .order('name')

  if (playersError) {
    throw new Error(
      playersError.message
    )
  }

  const players =
    (playersData ?? []) as Player[]

  const geoff =
    players.find(
      (player) =>
        player.name.toLowerCase() ===
        'geoff'
    ) ?? null

  const general =
    players.find(
      (player) =>
        player.name.toLowerCase() ===
        'general'
    ) ?? null

  const {
    data: weeksData,
    error: weeksError,
  } = await supabase
    .from('weeks')
    .select(`
      id,
      week_number,
      first_picker_id,
      status,
      starts_at,
      ends_at
    `)
    .eq(
      'season_id',
      season.id
    )
    .order('week_number', {
      ascending: true,
    })

  if (weeksError) {
    throw new Error(
      weeksError.message
    )
  }

  const weeks =
    (weeksData ?? []) as Week[]

  const weekIds =
    weeks.map(
      (week) =>
        week.id
    )

  let picks: Pick[] = []

  if (weekIds.length > 0) {
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
        is_automatic,
        result
      `)
      .in(
        'week_id',
        weekIds
      )
      .order('pick_number', {
        ascending: true,
      })

    if (picksError) {
      throw new Error(
        picksError.message
      )
    }

    picks =
      (picksData ?? []) as Pick[]
  }

  const gameIds =
    Array.from(
      new Set(
        picks.map(
          (pick) =>
            pick.game_id
        )
      )
    )

  let games: Game[] = []

  if (gameIds.length > 0) {
    const {
      data: gamesData,
      error: gamesError,
    } = await supabase
      .from('games')
      .select(`
        id,
        home_team,
        away_team,
        completed,
        home_score,
        away_score
      `)
      .in(
        'id',
        gameIds
      )

    if (gamesError) {
      throw new Error(
        gamesError.message
      )
    }

    games =
      (gamesData ?? []) as Game[]
  }

  let adjustments: Adjustment[] = []

  if (weekIds.length > 0) {
    const {
      data: adjustmentsData,
      error: adjustmentsError,
    } = await supabase
      .from('result_adjustments')
      .select(`
        week_id,
        target_player_id,
        wins_delta,
        losses_delta,
        pushes_delta
      `)
      .in(
        'week_id',
        weekIds
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

    adjustments =
      (adjustmentsData ?? []) as Adjustment[]
  }

  const standings: Standing[] =
    players.map((player) => {
      const record =
        calculateHeadToHeadRecord(
          player.id,
          players,
          picks,
          adjustments
        )

      const decisions =
        record.wins + record.losses

      const percentage =
        decisions > 0
          ? record.wins / decisions
          : 0

      return {
        player,
        wins: record.wins,
        losses: record.losses,
        pushes: record.pushes,
        percentage,
      }
    })

  const geoffStanding =
    geoff
      ? standings.find(
          (standing) =>
            standing.player.id ===
            geoff.id
        ) ?? null
      : null

  const generalStanding =
    general
      ? standings.find(
          (standing) =>
            standing.player.id ===
            general.id
        ) ?? null
      : null

  const geoffSeasonWins =
    geoffStanding?.wins ?? 0

  const generalSeasonWins =
    generalStanding?.wins ?? 0

  const runningGeneralLead =
    STARTING_GENERAL_LEAD +
    generalSeasonWins -
    geoffSeasonWins

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl">
        {/* HEADER */}
        <header className="mb-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black sm:text-5xl">
                Season History
              </h1>

              <p className="mt-2 text-slate-400">
                {season.year} Spread Wars
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
              <div className="text-xs uppercase text-slate-500">
                Signed In
              </div>

              <div className="font-black text-emerald-400">
                {loggedInPlayer.name}
              </div>
            </div>
          </div>
        </header>

        {/* SEASON STANDINGS */}
        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-black">
            Season Standings
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              geoffStanding,
              generalStanding,
            ]
              .filter(
                (
                  standing
                ): standing is Standing =>
                  standing !== null
              )
              .map((standing) => (
                <div
                  key={standing.player.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                >
                  <div className="text-2xl font-black">
                    {standing.player.name}
                  </div>

                  <div className="mt-1 text-sm text-slate-400">
                    Head-to-Head Season Record
                  </div>

                  <div className="mt-5 text-4xl font-black">
                    {standing.wins}-
                    {standing.losses}-
                    {standing.pushes}
                  </div>

                  <div className="mt-2 text-sm text-slate-400">
                    {(
                      standing.percentage * 100
                    ).toFixed(1)}
                    % winning percentage
                  </div>
                </div>
              ))}

            <div className="rounded-2xl border border-amber-700/60 bg-amber-950/30 p-6">
              <div className="text-2xl font-black">
                Overall Tally
              </div>

              <div className="mt-1 text-sm text-amber-200/70">
                Live rivalry lead
              </div>

              <div className="mt-5 text-4xl font-black text-amber-300">
                {runningGeneralLead > 0 ? (
                  <>
                    General +{runningGeneralLead}
                  </>
                ) : runningGeneralLead < 0 ? (
                  <>
                    Geoff +{Math.abs(runningGeneralLead)}
                  </>
                ) : (
                  <>Tied</>
                )}
              </div>

              <div className="mt-2 text-sm text-amber-100/70">
                Updates as games are graded
              </div>

              <div className="mt-4 border-t border-amber-800/50 pt-4 text-xs text-amber-200/60">
                Started this season with General +20
              </div>
            </div>
          </div>
        </section>

        {/* COLOR KEY */}
        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center gap-5 text-sm">
            <div className="font-black text-slate-300">
              From your perspective:
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              <span className="text-slate-400">
                Good for you
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-slate-400">
                Bad for you
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-slate-600" />
              <span className="text-slate-400">
                Pending / Push
              </span>
            </div>
          </div>
        </section>

        {/* WEEK HISTORY */}
        <section>
          <h2 className="mb-4 text-2xl font-black">
            Week History
          </h2>

          {weeks.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-500">
              No weeks have been created yet.
            </div>
          ) : (
            <div className="space-y-6">
              {[...weeks]
                .reverse()
                .map((week) => {
                  const weekPicks =
                    picks.filter(
                      (pick) =>
                        pick.week_id ===
                        week.id
                    )

                  const weekAdjustments =
                    adjustments.filter(
                      (
                        adjustment
                      ) =>
                        adjustment.week_id ===
                        week.id
                    )

                  const firstPicker =
                    players.find(
                      (player) =>
                        player.id ===
                        week.first_picker_id
                    )

                  const weekRecords =
                    players.map(
                      (player) => {
                        const record =
                          calculateHeadToHeadRecord(
                            player.id,
                            players,
                            weekPicks,
                            weekAdjustments
                          )

                        return {
                          player,
                          ...record,
                        }
                      }
                    )

                  const automaticPicks =
                    [...weekPicks]
                      .filter(
                        (pick) =>
                          pick.is_automatic
                      )
                      .sort(
                        (a, b) =>
                          a.pick_number -
                          b.pick_number
                      )

                  const normalPicks =
                    [...weekPicks]
                      .filter(
                        (pick) =>
                          !pick.is_automatic
                      )
                      .sort(
                        (a, b) =>
                          a.pick_number -
                          b.pick_number
                      )

                  return (
                    <article
                      key={week.id}
                      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
                    >
                      {/* WEEK HEADER */}
                      <div className="border-b border-slate-800 p-5 sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-3">
                              <h3 className="text-2xl font-black">
                                Week {week.week_number}
                              </h3>

                              <span
                                className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                                  week.status === 'complete'
                                    ? 'bg-emerald-950 text-emerald-400'
                                    : 'bg-cyan-950 text-cyan-400'
                                }`}
                              >
                                {week.status}
                              </span>
                            </div>

                            <p className="mt-2 text-sm text-slate-400">
                              First normal pick:{' '}
                              <strong className="text-slate-200">
                                {firstPicker?.name ?? '—'}
                              </strong>
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            {weekRecords.map(
                              (record) => (
                                <div
                                  key={record.player.id}
                                  className="rounded-xl bg-slate-800 px-4 py-3 text-center"
                                >
                                  <div className="text-xs text-slate-400">
                                    {record.player.name}
                                  </div>

                                  <div className="mt-1 font-black">
                                    {record.wins}-
                                    {record.losses}-
                                    {record.pushes}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>

                      {weekPicks.length === 0 ? (
                        <div className="p-6 text-slate-500">
                          No picks recorded for this week.
                        </div>
                      ) : (
                        <div className="space-y-6 p-4 sm:p-6">
                          {/* AUTOMATIC PICKS */}
                          {automaticPicks.length > 0 && (
                            <div>
                              <div className="mb-3 text-sm font-black text-cyan-400">
                                Automatic Picks
                              </div>

                              <div className="space-y-4">
                                {automaticPicks.map(
                                  (pick) => {
                                    const player =
                                      players.find(
                                        (
                                          item
                                        ) =>
                                          item.id ===
                                          pick.player_id
                                      )

                                    if (!player) {
                                      return null
                                    }

                                    return (
                                      <PickMatchupRow
                                        key={pick.id}
                                        player={player}
                                        pick={pick}
                                        games={games}
                                        loggedInPlayerId={
                                          loggedInPlayer.id
                                        }
                                        label="Automatic Pick"
                                      />
                                    )
                                  }
                                )}
                              </div>
                            </div>
                          )}

                          {/* DRAFT PICKS */}
                          {normalPicks.length > 0 && (
                            <div>
                              <div className="mb-3 text-sm font-black text-slate-300">
                                Draft Picks
                              </div>

                              <div className="space-y-4">
                                {normalPicks.map(
                                  (
                                    pick,
                                    index
                                  ) => {
                                    const player =
                                      players.find(
                                        (
                                          item
                                        ) =>
                                          item.id ===
                                          pick.player_id
                                      )

                                    if (!player) {
                                      return null
                                    }

                                    return (
                                      <PickMatchupRow
                                        key={pick.id}
                                        player={player}
                                        pick={pick}
                                        games={games}
                                        loggedInPlayerId={
                                          loggedInPlayer.id
                                        }
                                        label={`Pick ${
                                          index + 1
                                        }`}
                                      />
                                    )
                                  }
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
            </div>
          )}
        </section>

        {/* BACK BUTTON */}
        <div className="mt-8 pb-8">
          <a
            href="/"
            className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 text-center text-base font-black text-white transition hover:bg-slate-800"
          >
            ← Back to Spread Wars
          </a>
        </div>
      </div>
    </main>
  )
}