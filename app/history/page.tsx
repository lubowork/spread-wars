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

type Pick = {
  id: string
  week_id: string
  player_id: string
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

const STARTING_GENERAL_LEAD = 20

function formatSpread(
  spread: number
) {
  if (spread > 0) {
    return `+${spread}`
  }

  return `${spread}`
}

function resultBadgeClasses(
  result: string
) {
  if (result === 'win') {
    return 'bg-emerald-950 text-emerald-300 border border-emerald-800'
  }

  if (result === 'loss') {
    return 'bg-red-950 text-red-300 border border-red-800'
  }

  if (result === 'push') {
    return 'bg-amber-950 text-amber-300 border border-amber-800'
  }

  return 'bg-slate-800 text-slate-400 border border-slate-700'
}

function perspectiveClasses(
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
    pick.player_id ===
    loggedInPlayerId

  const favorable =
    (
      isMyPick &&
      pick.result === 'win'
    ) ||
    (
      !isMyPick &&
      pick.result === 'loss'
    )

  if (favorable) {
    return 'border-emerald-700 bg-emerald-950/40'
  }

  return 'border-red-800 bg-red-950/40'
}

function getPickForPlayer(
  picks: Pick[],
  playerId: string
) {
  return picks.find(
    (pick) =>
      pick.player_id ===
      playerId
  )
}

export default async function HistoryPage() {
  // --------------------------------------------------
  // REQUIRE LOGIN
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
  // VERIFY LOGIN
  // --------------------------------------------------

  const {
    data: loggedInPlayer,
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
    !loggedInPlayer
  ) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">

        <div className="mx-auto max-w-5xl">

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

  // --------------------------------------------------
  // CURRENT SEASON
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
    .order(
      'year',
      {
        ascending: false,
      }
    )
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

        <div className="mx-auto max-w-5xl">

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
        player.name
          .toLowerCase() ===
        'geoff'
    )

  const general =
    players.find(
      (player) =>
        player.name
          .toLowerCase() ===
        'general'
    )

  // --------------------------------------------------
  // ALL WEEKS
  // --------------------------------------------------

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
    .order(
      'week_number',
      {
        ascending: true,
      }
    )

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

  // --------------------------------------------------
  // PICKS
  // --------------------------------------------------

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

    picks =
      (picksData ?? []) as Pick[]
  }

  // --------------------------------------------------
  // APPROVED ADJUSTMENTS
  // --------------------------------------------------

  let adjustments: Adjustment[] =
    []

  if (weekIds.length > 0) {
    const {
      data: adjustmentsData,
      error:
        adjustmentsError,
    } = await supabase
      .from(
        'result_adjustments'
      )
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
      (adjustmentsData ??
        []) as Adjustment[]
  }

  // --------------------------------------------------
  // SEASON RECORDS
  // --------------------------------------------------

  const standings =
    players.map(
      (player) => {
        const playerPicks =
          picks.filter(
            (pick) =>
              pick.player_id ===
              player.id
          )

        let wins =
          playerPicks.filter(
            (pick) =>
              pick.result ===
              'win'
          ).length

        let losses =
          playerPicks.filter(
            (pick) =>
              pick.result ===
              'loss'
          ).length

        let pushes =
          playerPicks.filter(
            (pick) =>
              pick.result ===
              'push'
          ).length

        const playerAdjustments =
          adjustments.filter(
            (adjustment) =>
              adjustment.target_player_id ===
              player.id
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

        const decisions =
          wins + losses

        const percentage =
          decisions > 0
            ? wins / decisions
            : 0

        return {
          player,
          wins,
          losses,
          pushes,
          percentage,
        }
      }
    )

  const geoffStanding =
    standings.find(
      (standing) =>
        standing.player.id ===
        geoff?.id
    )

  const generalStanding =
    standings.find(
      (standing) =>
        standing.player.id ===
        general?.id
    )

  const geoffSeasonWins =
    geoffStanding?.wins ?? 0

  const generalSeasonWins =
    generalStanding?.wins ?? 0

  const runningGeneralLead =
    STARTING_GENERAL_LEAD +
    generalSeasonWins -
    geoffSeasonWins

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

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
                {
                  loggedInPlayer.name
                }
              </div>

            </div>

          </div>

        </header>

        {/* SEASON RECORDS + OVERALL */}

        <section className="mb-8">

          <h2 className="mb-4 text-2xl font-black">
            Season Standings
          </h2>

          <div className="grid gap-4 md:grid-cols-3">

            {[
              geoffStanding,
              generalStanding,
            ]
              .filter(Boolean)
              .map(
                (standing) => (
                  <div
                    key={
                      standing!.player.id
                    }
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                  >

                    <div className="text-2xl font-black">
                      {
                        standing!.player.name
                      }
                    </div>

                    <div className="mt-1 text-sm text-slate-400">
                      Season Record
                    </div>

                    <div className="mt-5 text-4xl font-black">
                      {
                        standing!.wins
                      }
                      -
                      {
                        standing!.losses
                      }
                      -
                      {
                        standing!.pushes
                      }
                    </div>

                    <div className="mt-2 text-sm text-slate-400">
                      {(
                        standing!.percentage *
                        100
                      ).toFixed(1)}
                      % winning percentage
                    </div>

                  </div>
                )
              )}

            {/* OVERALL TALLY */}

            <div className="rounded-2xl border border-amber-700/60 bg-amber-950/30 p-6">

              <div className="text-2xl font-black">
                Overall Tally
              </div>

              <div className="mt-1 text-sm text-amber-200/70">
                All-time rivalry
              </div>

              <div className="mt-5 text-4xl font-black text-amber-300">

                {runningGeneralLead >
                0 ? (
                  <>
                    General +
                    {
                      runningGeneralLead
                    }
                  </>
                ) : runningGeneralLead <
                  0 ? (
                  <>
                    Geoff +
                    {Math.abs(
                      runningGeneralLead
                    )}
                  </>
                ) : (
                  <>Tied</>
                )}

              </div>

              <div className="mt-2 text-sm text-amber-100/70">
                {runningGeneralLead ===
                0
                  ? 'Overall games are tied.'
                  : 'Overall games ahead'}
              </div>

              <div className="mt-3 text-xs text-amber-200/60">
                Started this season with General +20.
              </div>

            </div>

          </div>

        </section>

        {/* COLOR KEY */}

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">

          <div className="flex flex-wrap items-center gap-4 text-sm">

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
                .map(
                  (week) => {
                    const weekPicks =
                      picks.filter(
                        (pick) =>
                          pick.week_id ===
                          week.id
                      )

                    const weekAdjustments =
                      adjustments.filter(
                        (adjustment) =>
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
                          const playerPicks =
                            weekPicks.filter(
                              (pick) =>
                                pick.player_id ===
                                player.id
                            )

                          let wins =
                            playerPicks.filter(
                              (pick) =>
                                pick.result ===
                                'win'
                            ).length

                          let losses =
                            playerPicks.filter(
                              (pick) =>
                                pick.result ===
                                'loss'
                            ).length

                          let pushes =
                            playerPicks.filter(
                              (pick) =>
                                pick.result ===
                                'push'
                            ).length

                          for (
                            const adjustment of
                            weekAdjustments.filter(
                              (item) =>
                                item.target_player_id ===
                                player.id
                            )
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
                            player,
                            wins,
                            losses,
                            pushes,
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

                    const normalRounds:
                      Pick[][] = []

                    for (
                      let i = 0;
                      i <
                      normalPicks.length;
                      i += 2
                    ) {
                      normalRounds.push(
                        normalPicks.slice(
                          i,
                          i + 2
                        )
                      )
                    }

                    const orderedPlayers =
                      [
                        geoff,
                        general,
                      ].filter(
                        Boolean
                      ) as Player[]

                    return (
                      <article
                        key={
                          week.id
                        }
                        className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
                      >

                        {/* WEEK HEADER */}

                        <div className="border-b border-slate-800 p-5 sm:p-6">

                          <div className="flex flex-wrap items-start justify-between gap-4">

                            <div>

                              <div className="flex items-center gap-3">

                                <h3 className="text-2xl font-black">
                                  Week{' '}
                                  {
                                    week.week_number
                                  }
                                </h3>

                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                                    week.status ===
                                    'complete'
                                      ? 'bg-emerald-950 text-emerald-400'
                                      : 'bg-cyan-950 text-cyan-400'
                                  }`}
                                >
                                  {
                                    week.status
                                  }
                                </span>

                              </div>

                              <p className="mt-2 text-sm text-slate-400">
                                First normal pick:{' '}
                                <strong className="text-slate-200">
                                  {firstPicker?.name ??
                                    '—'}
                                </strong>
                              </p>

                            </div>

                            <div className="flex flex-wrap gap-3">

                              {weekRecords.map(
                                (
                                  record
                                ) => (
                                  <div
                                    key={
                                      record.player.id
                                    }
                                    className="rounded-xl bg-slate-800 px-4 py-3 text-center"
                                  >

                                    <div className="text-xs text-slate-400">
                                      {
                                        record.player.name
                                      }
                                    </div>

                                    <div className="mt-1 font-black">
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

                                  </div>
                                )
                              )}

                            </div>

                          </div>

                        </div>

                        {weekPicks.length ===
                        0 ? (
                          <div className="p-6 text-slate-500">
                            No picks recorded for this week.
                          </div>
                        ) : (
                          <div className="space-y-5 p-4 sm:p-6">

                            {/* AUTOMATIC PICKS */}

                            {automaticPicks.length >
                              0 && (
                              <div>

                                <div className="mb-2 text-xs font-black uppercase tracking-wide text-cyan-400">
                                  Automatic Picks
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">

                                  {orderedPlayers.map(
                                    (
                                      player
                                    ) => {
                                      const pick =
                                        getPickForPlayer(
                                          automaticPicks,
                                          player.id
                                        )

                                      return (
                                        <div
                                          key={
                                            player.id
                                          }
                                          className={`min-w-0 rounded-xl border p-4 ${perspectiveClasses(
                                            pick,
                                            loggedInPlayer.id
                                          )}`}
                                        >

                                          <div className="flex items-center justify-between gap-2">

                                            <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                                              {
                                                player.name
                                              }
                                            </div>

                                            {pick && (
                                              <span className="text-xs font-bold text-slate-500">
                                                #
                                                {
                                                  pick.pick_number
                                                }
                                              </span>
                                            )}

                                          </div>

                                          {pick ? (
                                            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">

                                              <div className="min-w-0">

                                                <div className="truncate text-lg font-black">
                                                  {
                                                    pick.team
                                                  }
                                                </div>

                                                <div className="mt-1 text-xl font-black text-cyan-300">
                                                  {formatSpread(
                                                    Number(
                                                      pick.spread
                                                    )
                                                  )}
                                                </div>

                                              </div>

                                              <span
                                                className={`rounded-full px-3 py-1 text-xs font-black uppercase ${resultBadgeClasses(
                                                  pick.result
                                                )}`}
                                              >
                                                {
                                                  pick.result
                                                }
                                              </span>

                                            </div>
                                          ) : (
                                            <div className="mt-3 text-sm text-slate-500">
                                              Waiting for pick
                                            </div>
                                          )}

                                        </div>
                                      )
                                    }
                                  )}

                                </div>

                              </div>
                            )}

                            {/* NORMAL DRAFT ROUNDS */}

                            {normalRounds.map(
                              (
                                round,
                                index
                              ) => (
                                <div
                                  key={
                                    `round-${index}`
                                  }
                                >

                                  <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                                    Draft Round{' '}
                                    {
                                      index +
                                      1
                                    }
                                  </div>

                                  <div className="grid gap-2 sm:grid-cols-2">

                                    {orderedPlayers.map(
                                      (
                                        player
                                      ) => {
                                        const pick =
                                          getPickForPlayer(
                                            round,
                                            player.id
                                          )

                                        return (
                                          <div
                                            key={
                                              player.id
                                            }
                                            className={`min-w-0 rounded-xl border p-4 ${perspectiveClasses(
                                              pick,
                                              loggedInPlayer.id
                                            )}`}
                                          >

                                            <div className="flex items-center justify-between gap-2">

                                              <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                                                {
                                                  player.name
                                                }
                                              </div>

                                              {pick && (
                                                <span className="text-xs font-bold text-slate-500">
                                                  #
                                                  {
                                                    pick.pick_number
                                                  }
                                                </span>
                                              )}

                                            </div>

                                            {pick ? (
                                              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">

                                                <div className="min-w-0">

                                                  <div className="truncate text-lg font-black">
                                                    {
                                                      pick.team
                                                    }
                                                  </div>

                                                  <div className="mt-1 text-xl font-black text-cyan-300">
                                                    {formatSpread(
                                                      Number(
                                                        pick.spread
                                                      )
                                                    )}
                                                  </div>

                                                </div>

                                                <span
                                                  className={`rounded-full px-3 py-1 text-xs font-black uppercase ${resultBadgeClasses(
                                                    pick.result
                                                  )}`}
                                                >
                                                  {
                                                    pick.result
                                                  }
                                                </span>

                                              </div>
                                            ) : (
                                              <div className="mt-3 text-sm text-slate-500">
                                                Waiting for pick
                                              </div>
                                            )}

                                          </div>
                                        )
                                      }
                                    )}

                                  </div>

                                </div>
                              )
                            )}

                          </div>
                        )}

                      </article>
                    )
                  }
                )}

            </div>
          )}

        </section>

        {/* BACK */}

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