'use client'

import {
  useEffect,
  useState,
} from 'react'

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

type PendingPick = {
  game: Game
  team: string
  spread: number
}

type Props = {
  players: Player[]
  games: Game[]
  picks: Pick[]
  weekId: string
  firstPickerId: string
  loggedInPlayerId: string
  allowLaterDayGames: boolean
  firstGameDayKey: string | null
  firstGameDayLabel: string | null
}

function getEasternDateKey(
  isoDate: string
) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }
    )

  const parts =
    formatter.formatToParts(
      new Date(isoDate)
    )

  const year =
    parts.find(
      (part) =>
        part.type === 'year'
    )?.value

  const month =
    parts.find(
      (part) =>
        part.type === 'month'
    )?.value

  const day =
    parts.find(
      (part) =>
        part.type === 'day'
    )?.value

  if (
    !year ||
    !month ||
    !day
  ) {
    return null
  }

  return `${year}-${month}-${day}`
}

function formatEasternKickoff(
  isoDate: string
) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone:
        'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }
  ).format(
    new Date(isoDate)
  )
}

export default function DraftBoard({
  players,
  games,
  picks,
  weekId,
  firstPickerId,
  loggedInPlayerId,
  allowLaterDayGames,
  firstGameDayKey,
  firstGameDayLabel,
}: Props) {
  const [
    currentPicks,
    setCurrentPicks,
  ] =
    useState<Pick[]>(picks)

  const [message, setMessage] =
    useState('')

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false)

  const [
    selectedTeam,
    setSelectedTeam,
  ] =
    useState('')

  const [
    pendingPick,
    setPendingPick,
  ] =
    useState<PendingPick | null>(
      null
    )

  // --------------------------------------------------
  // KEEP LOCAL PICKS IN SYNC WITH SERVER PROPS
  // --------------------------------------------------

  useEffect(() => {
    setCurrentPicks(picks)
  }, [picks])

  // --------------------------------------------------
  // AUTOMATIC PHONE REFRESH
  // --------------------------------------------------

  useEffect(() => {
    let checking = false

    async function checkForNewPick() {
      if (
        checking ||
        document.visibilityState !==
          'visible'
      ) {
        return
      }

      checking = true

      try {
        const response =
          await fetch(
            '/api/draft-state',
            {
              cache: 'no-store',
            }
          )

        if (!response.ok) {
          return
        }

        const responseText =
          await response.text()

        let data: any

        try {
          data =
            JSON.parse(
              responseText
            )
        } catch {
          console.error(
            'Draft-state route returned a non-JSON response.'
          )

          return
        }

        if (
          data.success &&
          data.weekId ===
            weekId &&
          data.pickCount !==
            currentPicks.length
        ) {
          window.location.reload()
        }
      } catch (error) {
        console.error(
          'Draft refresh check failed:',
          error
        )
      } finally {
        checking = false
      }
    }

    const interval =
      window.setInterval(
        checkForNewPick,
        5000
      )

    function handleReturnToApp() {
      if (
        document.visibilityState ===
        'visible'
      ) {
        checkForNewPick()
      }
    }

    document.addEventListener(
      'visibilitychange',
      handleReturnToApp
    )

    window.addEventListener(
      'focus',
      handleReturnToApp
    )

    return () => {
      window.clearInterval(
        interval
      )

      document.removeEventListener(
        'visibilitychange',
        handleReturnToApp
      )

      window.removeEventListener(
        'focus',
        handleReturnToApp
      )
    }
  }, [
    weekId,
    currentPicks.length,
  ])

  // --------------------------------------------------
  // AUTOMATIC + NORMAL PICKS
  // --------------------------------------------------

  const automaticPicks =
    currentPicks.filter(
      (pick) =>
        pick.is_automatic
    )

  const normalPicks =
    currentPicks.filter(
      (pick) =>
        !pick.is_automatic
    )

  // --------------------------------------------------
  // DRAFT ORDER
  // --------------------------------------------------

  const firstPicker =
    players.find(
      (player) =>
        player.id ===
        firstPickerId
    )

  const secondPicker =
    players.find(
      (player) =>
        player.id !==
        firstPickerId
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
  // FIRST-GAME-DAY RULE
  // --------------------------------------------------

  const dayEligibleGames =
    allowLaterDayGames ||
    !firstGameDayKey
      ? games
      : games.filter(
          (game) =>
            getEasternDateKey(
              game.start_time
            ) ===
            firstGameDayKey
        )

  const laterDayGameCount =
    games.length -
    dayEligibleGames.length

  // --------------------------------------------------
  // REMOVE GAMES ALREADY PICKED
  // --------------------------------------------------

  const pickedGameIds =
    new Set(
      currentPicks.map(
        (pick) =>
          pick.game_id
      )
    )

  const availableGames =
    dayEligibleGames.filter(
      (game) =>
        !pickedGameIds.has(
          game.id
        )
    )

  // --------------------------------------------------
  // ALPHABETICAL TEAM DROPDOWN
  // --------------------------------------------------

  const availableTeams =
    Array.from(
      new Set(
        availableGames.flatMap(
          (game) => [
            game.away_team,
            game.home_team,
          ]
        )
      )
    ).sort(
      (a, b) =>
        a.localeCompare(
          b,
          'en',
          {
            sensitivity:
              'base',
          }
        )
    )

  useEffect(() => {
    if (
      selectedTeam &&
      !availableTeams.includes(
        selectedTeam
      )
    ) {
      setSelectedTeam('')
    }
  }, [
    selectedTeam,
    availableTeams,
  ])

  const visibleGames =
    selectedTeam
      ? availableGames.filter(
          (game) =>
            game.home_team ===
              selectedTeam ||
            game.away_team ===
              selectedTeam
        )
      : availableGames

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
            odd.team ===
            team
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

    return (
      teamOdds[0] ??
      null
    )
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
  // REQUEST PICK CONFIRMATION
  // --------------------------------------------------

  function requestPick(
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

    if (
      !allowLaterDayGames &&
      firstGameDayKey &&
      getEasternDateKey(
        game.start_time
      ) !== firstGameDayKey
    ) {
      setMessage(
        'Later-day games are currently locked. Enable Allow Later-Day Games in Admin to draft this game.'
      )

      return
    }

    const odds =
      getSpread(
        game,
        team
      )

    if (!odds) {
      setMessage(
        'No current DraftKings spread is available for that team.'
      )

      return
    }

    setMessage('')

    setPendingPick({
      game,
      team,
      spread:
        Number(
          odds.spread
        ),
    })
  }

  // --------------------------------------------------
  // CANCEL PICK
  // --------------------------------------------------

  function cancelPick() {
    if (submitting) {
      return
    }

    setPendingPick(null)
  }

  // --------------------------------------------------
  // CONFIRM + MAKE PICK
  // --------------------------------------------------

  async function confirmPick() {
    if (
      !pendingPick ||
      !currentPlayer
    ) {
      return
    }

    if (!isMyTurn) {
      setPendingPick(null)

      setMessage(
        `It is ${currentPlayer.name}'s turn.`
      )

      return
    }

    if (submitting) {
      return
    }

    const game =
      pendingPick.game

    const team =
      pendingPick.team

    setSubmitting(true)
    setMessage('')

    try {
      const response =
        await fetch(
          '/api/picks',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                weekId,

                playerId:
                  loggedInPlayerId,

                gameId:
                  game.id,

                team,
              }),
          }
        )

      const responseText =
        await response.text()

      let data: any

      try {
        data =
          JSON.parse(
            responseText
          )
      } catch {
        throw new Error(
          `Unexpected server response (${response.status}).`
        )
      }

      if (
        !response.ok ||
        !data.success
      ) {
        setMessage(
          data.error ??
            'Unable to make pick.'
        )

        setPendingPick(null)

        return
      }

      setCurrentPicks(
        (previous) => [
          ...previous,
          {
            ...data.pick,

            spread:
              Number(
                data.pick.spread
              ),
          },
        ]
      )

      setPendingPick(null)

      setSelectedTeam('')

      setMessage(
        data.message ??
          'Pick saved.'
      )

      window.setTimeout(
        () => {
          window.location.reload()
        },
        500
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong while making the pick.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  // --------------------------------------------------
  // PENDING PICK OPPONENT
  // --------------------------------------------------

  let pendingOpponent =
    ''

  let pendingLocation =
    ''

  if (pendingPick) {
    if (
      pendingPick.team ===
      pendingPick.game.home_team
    ) {
      pendingOpponent =
        pendingPick.game.away_team

      pendingLocation =
        'vs'
    } else {
      pendingOpponent =
        pendingPick.game.home_team

      pendingLocation =
        '@'
    }
  }

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <section className="space-y-6 lg:col-span-2">

      {/* PICK CONFIRMATION MODAL */}

      {pendingPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">

          <div className="w-full max-w-md rounded-2xl border border-cyan-500 bg-slate-950 p-6 shadow-2xl">

            <div className="text-sm font-black uppercase tracking-wide text-cyan-400">
              Confirm Pick
            </div>

            <div className="mt-2 text-2xl font-black">
              Are you sure?
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">

              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Pick #{pickNumber}
              </div>

              <div className="mt-1 text-sm font-bold text-slate-400">
                {
                  currentPlayer?.name
                }
              </div>

              <div className="mt-4 text-2xl font-black text-white">
                {
                  pendingPick.team
                }
              </div>

              <div className="mt-1 text-3xl font-black text-cyan-300">
                {formatSpread(
                  pendingPick.spread
                )}
              </div>

              <div className="mt-4 border-t border-slate-800 pt-4">

                <div className="font-bold text-slate-200">
                  {pendingLocation}{' '}
                  {pendingOpponent}
                </div>

                <div className="mt-1 text-sm text-slate-400">
                  {formatEasternKickoff(
                    pendingPick.game.start_time
                  )}
                </div>

              </div>

            </div>

            <div className="mt-5 rounded-xl border border-amber-800/60 bg-amber-950/30 p-3 text-sm text-amber-200">
              Once confirmed, this spread locks immediately and the entire game is removed from the draft.
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">

              <button
                type="button"
                disabled={
                  submitting
                }
                onClick={
                  cancelPick
                }
                className="min-h-14 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 font-black text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  submitting
                }
                onClick={
                  confirmPick
                }
                className="min-h-14 rounded-xl bg-emerald-500 px-5 py-3 font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {submitting
                  ? 'Saving...'
                  : 'Confirm Pick'}
              </button>

            </div>

          </div>

        </div>
      )}

      {/* CURRENT TURN */}

      <div
        className={`rounded-2xl border p-6 ${
          isMyTurn
            ? 'border-emerald-500/50 bg-emerald-950/30'
            : 'border-slate-800 bg-slate-900'
        }`}
      >

        {availableGames.length ===
        0 ? (
          <>
            <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
              No Available Games
            </div>

            <div className="mt-1 text-2xl font-black">
              No games remain available under the current draft settings.
            </div>

            {!allowLaterDayGames &&
              laterDayGameCount >
                0 && (
                <div className="mt-3 text-sm text-amber-300">
                  {laterDayGameCount}{' '}
                  later-day{' '}
                  {laterDayGameCount ===
                  1
                    ? 'game is'
                    : 'games are'}{' '}
                  currently locked.
                </div>
              )}
          </>
        ) : isMyTurn ? (
          <>
            <div className="text-sm font-bold uppercase tracking-wide text-emerald-400">
              Your Turn
            </div>

            <div className="mt-1 text-3xl font-black">
              {
                currentPlayer?.name
              }
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
              {
                currentPlayer?.name
              }{' '}
              is on the clock
            </div>

            <div className="mt-2 text-sm text-slate-400">
              The board checks for new picks automatically.
            </div>
          </>
        )}

      </div>

      {/* FIRST GAME DAY STATUS */}

      {!allowLaterDayGames &&
        firstGameDayKey && (
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4">

            <div className="text-sm font-black text-amber-300">
              First Game Day Only
            </div>

            <div className="mt-1 text-sm text-slate-300">
              Normal drafting is currently limited to{' '}
              <strong>
                {firstGameDayLabel ??
                  'the first game day'}
              </strong>.
            </div>

            {laterDayGameCount >
              0 && (
              <div className="mt-1 text-xs text-slate-500">
                {laterDayGameCount}{' '}
                later-day{' '}
                {laterDayGameCount ===
                1
                  ? 'game is'
                  : 'games are'}{' '}
                hidden. They can be enabled in Admin.
              </div>
            )}

          </div>
        )}

      {/* MESSAGE */}

      {message && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">
          {message}
        </div>
      )}

      {/* TEAM FINDER */}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">

          <div className="min-w-0 flex-1">

            <label
              htmlFor="team-filter"
              className="mb-2 block text-sm font-black text-slate-200"
            >
              Find a Team
            </label>

            <select
              id="team-filter"
              value={
                selectedTeam
              }
              onChange={(
                event
              ) =>
                setSelectedTeam(
                  event.target.value
                )
              }
              disabled={
                availableTeams.length ===
                0
              }
              className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-base font-bold text-slate-950 disabled:opacity-50"
            >

              <option value="">
                All Teams
              </option>

              {availableTeams.map(
                (team) => (
                  <option
                    key={
                      team
                    }
                    value={
                      team
                    }
                  >
                    {team}
                  </option>
                )
              )}

            </select>

          </div>

          {selectedTeam && (
            <button
              type="button"
              onClick={() =>
                setSelectedTeam('')
              }
              className="min-h-12 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 font-bold hover:bg-slate-700"
            >
              Show All Teams
            </button>
          )}

        </div>

        <p className="mt-3 text-xs text-slate-500">
          Teams are listed alphabetically. Select a school to show only that school&apos;s available matchup.
        </p>

      </div>

      {/* AVAILABLE GAMES */}

      <div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">

          <div>

            <h2 className="text-2xl font-black">
              Available Games
            </h2>

            {selectedTeam && (
              <div className="mt-1 text-sm font-bold text-cyan-400">
                Showing{' '}
                {selectedTeam}
              </div>
            )}

          </div>

          <div className="text-sm text-slate-500">
            DraftKings Spread
          </div>

        </div>

        {availableGames.length ===
        0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
            No games are currently available.
          </div>
        ) : visibleGames.length ===
          0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">

            <div className="font-black">
              No available matchup found.
            </div>

            <div className="mt-2 text-sm text-slate-500">
              Choose another team or select All Teams.
            </div>

          </div>
        ) : (
          <div className="space-y-4">

            {visibleGames.map(
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
                    key={
                      game.id
                    }
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
                  >

                    <div className="mb-4 text-xs uppercase tracking-wide text-slate-500">
                      {formatEasternKickoff(
                        game.start_time
                      )}
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
                          requestPick(
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
                          requestPick(
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

          {[...automaticPicks]
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
                        {
                          player?.name
                        }
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="font-bold">
                        {
                          pick.team
                        }
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
              }
            )}

          {/* NORMAL PICKS */}

          {[...normalPicks]
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
                        {
                          player?.name
                        }
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="font-bold">
                        {
                          pick.team
                        }
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
              }
            )}

        </div>

      </div>

    </section>
  )
}