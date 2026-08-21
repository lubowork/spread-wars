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

function formatSpread(
  spread: number
) {
  if (spread > 0) {
    return `+${spread}`
  }

  return `${spread}`
}

function resultClasses(
  result: string
) {
  if (result === 'win') {
    return 'bg-emerald-950 text-emerald-400'
  }

  if (result === 'loss') {
    return 'bg-red-950 text-red-400'
  }

  if (result === 'push') {
    return 'bg-amber-950 text-amber-400'
  }

  return 'bg-slate-800 text-slate-400'
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
  // VERIFY THIS LOGIN IS A PLAYER
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

          <a
            href="/"
            className="font-bold text-cyan-400"
          >
            ← Back to Spread Wars
          </a>

          <h1 className="mt-6 text-4xl font-black">
            Season History
          </h1>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
            No season has been created.
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

  // --------------------------------------------------
  // ALL WEEKS FOR SEASON
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
  // ALL PICKS FOR THE SEASON
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
      .sort(
        (a, b) =>
          b.percentage -
          a.percentage
      )

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">

      <div className="mx-auto max-w-6xl">

        {/* HEADER */}

        <header className="mb-8">

          <a
            href="/"
            className="text-sm font-bold text-cyan-400 hover:text-cyan-300"
          >
            ← Back to Spread Wars
          </a>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">

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

        {/* SEASON STANDINGS */}

        <section className="mb-8">

          <h2 className="mb-4 text-2xl font-black">
            Season Standings
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">

            {standings.map(
              (
                standing,
                index
              ) => (
                <div
                  key={
                    standing.player.id
                  }
                  className={`rounded-2xl border p-6 ${
                    index === 0
                      ? 'border-cyan-500 bg-cyan-950/30'
                      : 'border-slate-800 bg-slate-900'
                  }`}
                >

                  <div className="flex items-start justify-between gap-4">

                    <div>

                      <div className="text-2xl font-black">
                        {
                          standing.player.name
                        }
                      </div>

                      <div className="mt-1 text-sm text-slate-400">
                        Season Record
                      </div>

                    </div>

                    {index === 0 &&
                      standing.wins +
                        standing.losses >
                        0 && (
                        <span className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-black uppercase text-slate-950">
                          Leader
                        </span>
                      )}

                  </div>

                  <div className="mt-5 text-4xl font-black">
                    {
                      standing.wins
                    }
                    -
                    {
                      standing.losses
                    }
                    -
                    {
                      standing.pushes
                    }
                  </div>

                  <div className="mt-2 text-sm text-slate-400">
                    {(
                      standing.percentage *
                      100
                    ).toFixed(1)}
                    % winning percentage
                  </div>

                </div>
              )
            )}

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

                            <div className="flex gap-3">

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

                        {/* PICKS */}

                        {weekPicks.length ===
                        0 ? (
                          <div className="p-6 text-slate-500">
                            No picks recorded for this week.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-800">

                            {[...weekPicks]
                              .sort(
                                (
                                  a,
                                  b
                                ) =>
                                  a.pick_number -
                                  b.pick_number
                              )
                              .map(
                                (
                                  pick
                                ) => {
                                  const player =
                                    players.find(
                                      (
                                        item
                                      ) =>
                                        item.id ===
                                        pick.player_id
                                    )

                                  return (
                                    <div
                                      key={
                                        pick.id
                                      }
                                      className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-6"
                                    >

                                      <div className="flex items-center gap-4">

                                        <div className="w-16 text-sm font-black text-slate-500">
                                          #
                                          {
                                            pick.pick_number
                                          }
                                        </div>

                                        <div>

                                          <div className="flex flex-wrap items-center gap-2">

                                            <span className="font-black">
                                              {
                                                pick.team
                                              }
                                            </span>

                                            {pick.is_automatic && (
                                              <span className="rounded-full bg-cyan-950 px-2 py-1 text-[10px] font-black uppercase text-cyan-400">
                                                Auto
                                              </span>
                                            )}

                                          </div>

                                          <div className="mt-1 text-sm text-slate-400">
                                            {player?.name ??
                                              'Unknown'}
                                            {' · '}
                                            {formatSpread(
                                              Number(
                                                pick.spread
                                              )
                                            )}
                                          </div>

                                        </div>

                                      </div>

                                      <span
                                        className={`rounded-full px-3 py-1 text-xs font-black uppercase ${resultClasses(
                                          pick.result
                                        )}`}
                                      >
                                        {
                                          pick.result
                                        }
                                      </span>

                                    </div>
                                  )
                                }
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

      </div>

    </main>
  )
}