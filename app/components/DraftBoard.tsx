'use client'

import { useState } from 'react'

type Player = {
  id: string
  name: string
  automatic_team: string
}

type Odd = {
  team: string
  spread: number
  price: number | null
  fetched_at: string
}

type Game = {
  id: string
  home_team: string
  away_team: string
  start_time: string
  odds: Odd[]
}

type Pick = {
  id: string
  pick_number: number
  player_id: string
  game_id: string
  team: string
  spread: number
  is_automatic: boolean
  result: string
}

type Props = {
  players: Player[]
  games: Game[]
  picks: Pick[]
  weekId: string
  firstPickerId: string
  loggedInPlayerId: string
}

export default function DraftBoard({
  players,
  games,
  picks,
  weekId,
  firstPickerId,
  loggedInPlayerId,
}: Props) {
  const [currentPicks, setCurrentPicks] =
    useState<Pick[]>(picks)

  const [message, setMessage] =
    useState('')

  const [submitting, setSubmitting] =
    useState(false)

  // --------------------------------------------------
  // AUTOMATIC + NORMAL PICKS
  // --------------------------------------------------

  const automaticPicks =
    currentPicks.filter(
      (pick) => pick.is_automatic
    )

  const normalPicks =
    currentPicks.filter(
      (pick) => !pick.is_automatic
    )

  // --------------------------------------------------
  // DRAFT ORDER
  // --------------------------------------------------

  const firstPicker =
    players.find(
      (player) =>
        player.id === firstPickerId
    )

  const secondPicker =
    players.find(
      (player) =>
        player.id !== firstPickerId
    )

  const pickNumber =
    normalPicks.length + 3

  const currentPlayer =
    normalPicks.length % 2 === 0
      ? firstPicker
      : secondPicker

  const isMyTurn =
    currentPlayer?.id ===
    loggedInPlayerId

  // --------------------------------------------------
  // AVAILABLE GAMES
  // --------------------------------------------------

  const pickedGameIds =
    new Set(
      currentPicks.map(
        (pick) => pick.game_id
      )
    )

  const availableGames =
    games.filter(
      (game) =>
        !pickedGameIds.has(game.id)
    )

  // --------------------------------------------------
  // GET LATEST SPREAD
  // --------------------------------------------------

  function getSpread(
    game: Game,
    team: string
  ) {
    const teamOdds =
      game.odds
        .filter(
          (odd) =>
            odd.team === team
        )
        .sort(
          (a, b) =>
            new Date(
              b.fetched_at
            ).getTime() -
            new Date(
              a.fetched_at
            ).getTime()
        )

    return teamOdds[0] ?? null
  }

  // --------------------------------------------------
  // FORMAT SPREAD
  // --------------------------------------------------

  function formatSpread(
    spread: number
  ) {
    if (spread > 0) {
      return `+${spread}`
    }

    return `${spread}`
  }

  // --------------------------------------------------
  // MAKE PICK
  // --------------------------------------------------

  async function makePick(
    game: Game,
    team: string
  ) {
    if (!currentPlayer) {
      return
    }

    if (!isMyTurn) {
      setMessage(
        `It is ${currentPlayer.name}'s turn.`
      )

      return
    }

    if (submitting) {
      return
    }

    const odds =
      getSpread(game, team)

    if (!odds) {
      setMessage(
        'No current DraftKings spread is available for that team.'
      )

      return
    }

    setSubmitting(true)
    setMessage('')

    try {
      const response =
        await fetch(
          '/api/picks',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              weekId,
              playerId:
                loggedInPlayerId,
              gameId:
                game.id,
              team,
            }),
          }
        )

      const data =
        await response.json()

      if (
        !response.ok ||
        !data.success
      ) {
        setMessage(
          data.error ??
            'Unable to make pick.'
        )

        return
      }

      setCurrentPicks(
        (previous) => [
          ...previous,
          {
            ...data.pick,
            spread: Number(
              data.pick.spread
            ),
          },
        ]
      )

      setMessage(
        data.message ??
          'Pick saved.'
      )
    } catch {
      setMessage(
        'Something went wrong while making the pick.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <section className="space-y-6 lg:col-span-2">

      {/* CURRENT TURN */}

      <div
        className={`rounded-2xl border p-6 ${
          isMyTurn
            ? 'border-emerald-500/50 bg-emerald-950/30'
            : 'border-slate-800 bg-slate-900'
        }`}
      >
        {availableGames.length === 0 ? (
          <>
            <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Draft Complete
            </div>

            <div className="mt-1 text-2xl font-black">
              No games remain available.
            </div>
          </>
        ) : isMyTurn ? (
          <>
            <div className="text-sm font-bold uppercase tracking-wide text-emerald-400">
              Your Turn
            </div>

            <div className="mt-1 text-3xl font-black">
              {currentPlayer?.name}
            </div>

            <div className="mt-1 text-slate-400">
              Pick #{pickNumber}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Waiting
            </div>

            <div className="mt-1 text-2xl font-black">
              {currentPlayer?.name} is on the clock
            </div>

            <div className="mt-2 text-sm text-slate-400">
              You can view the board, but picks are disabled until your turn.
            </div>
          </>
        )}
      </div>

      {/* MESSAGE */}

      {message && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">
          {message}
        </div>
      )}

      {/* AVAILABLE GAMES */}

      <div>
        <div className="mb-4 flex items-center justify-between">

          <h2 className="text-2xl font-black">
            Available Games
          </h2>

          <div className="text-sm text-slate-500">
            DraftKings Spread
          </div>

        </div>

        {availableGames.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
            No games are currently available.
          </div>
        ) : (
          <div className="space-y-4">

            {availableGames.map(
              (game) => {

                const awayOdds =
                  getSpread(
                    game,
                    game.away_team
                  )

                const homeOdds =
                  getSpread(
                    game,
                    game.home_team
                  )

                return (
                  <div
                    key={game.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
                  >

                    <div className="mb-4 text-xs uppercase tracking-wide text-slate-500">
                      {new Date(
                        game.start_time
                      ).toLocaleString()}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">

                      {/* AWAY */}

                      <button
                        type="button"
                        disabled={
                          !isMyTurn ||
                          submitting ||
                          !awayOdds
                        }
                        onClick={() =>
                          makePick(
                            game,
                            game.away_team
                          )
                        }
                        className={`rounded-xl border p-4 text-left transition ${
                          isMyTurn &&
                          awayOdds &&
                          !submitting
                            ? 'border-slate-700 bg-slate-800 hover:border-emerald-500 hover:bg-slate-700'
                            : 'cursor-not-allowed border-slate-800 bg-slate-950 opacity-50'
                        }`}
                      >

                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Away
                        </div>

                        <div className="mt-1 font-bold">
                          {
                            game.away_team
                          }
                        </div>

                        <div className="mt-2 text-2xl font-black text-cyan-300">
                          {awayOdds
                            ? formatSpread(
                                awayOdds.spread
                              )
                            : '—'}
                        </div>

                      </button>

                      {/* HOME */}

                      <button
                        type="button"
                        disabled={
                          !isMyTurn ||
                          submitting ||
                          !homeOdds
                        }
                        onClick={() =>
                          makePick(
                            game,
                            game.home_team
                          )
                        }
                        className={`rounded-xl border p-4 text-left transition ${
                          isMyTurn &&
                          homeOdds &&
                          !submitting
                            ? 'border-slate-700 bg-slate-800 hover:border-emerald-500 hover:bg-slate-700'
                            : 'cursor-not-allowed border-slate-800 bg-slate-950 opacity-50'
                        }`}
                      >

                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Home
                        </div>

                        <div className="mt-1 font-bold">
                          {
                            game.home_team
                          }
                        </div>

                        <div className="mt-2 text-2xl font-black text-cyan-300">
                          {homeOdds
                            ? formatSpread(
                                homeOdds.spread
                              )
                            : '—'}
                        </div>

                      </button>

                    </div>

                  </div>
                )
              }
            )}

          </div>
        )}
      </div>

      {/* DRAFT HISTORY */}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

        <h2 className="mb-5 text-2xl font-black">
          Draft History
        </h2>

        <div className="space-y-3">

          {/* AUTOMATIC PICKS */}

          {automaticPicks
            .sort(
              (a, b) =>
                a.pick_number -
                b.pick_number
            )
            .map((pick) => {

              const player =
                players.find(
                  (p) =>
                    p.id ===
                    pick.player_id
                )

              return (
                <div
                  key={pick.id}
                  className="flex items-center justify-between rounded-xl bg-slate-800 p-4"
                >

                  <div>

                    <div className="flex items-center gap-2">

                      <span className="font-bold">
                        Pick #
                        {
                          pick.pick_number
                        }
                      </span>

                      <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-xs font-bold text-cyan-300">
                        AUTO
                      </span>

                    </div>

                    <div className="mt-1 text-sm text-slate-400">
                      {player?.name}
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="font-bold">
                      {pick.team}
                    </div>

                    <div className="text-cyan-300">
                      {formatSpread(
                        Number(
                          pick.spread
                        )
                      )}
                    </div>

                  </div>

                </div>
              )
            })}

          {/* NORMAL PICKS */}

          {normalPicks
            .sort(
              (a, b) =>
                a.pick_number -
                b.pick_number
            )
            .map((pick) => {

              const player =
                players.find(
                  (p) =>
                    p.id ===
                    pick.player_id
                )

              return (
                <div
                  key={pick.id}
                  className="flex items-center justify-between rounded-xl bg-slate-800 p-4"
                >

                  <div>

                    <div className="font-bold">
                      Pick #
                      {
                        pick.pick_number
                      }
                    </div>

                    <div className="mt-1 text-sm text-slate-400">
                      {player?.name}
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="font-bold">
                      {pick.team}
                    </div>

                    <div className="text-cyan-300">
                      {formatSpread(
                        Number(
                          pick.spread
                        )
                      )}
                    </div>

                  </div>

                </div>
              )
            })}

        </div>

      </div>

    </section>
  )
}