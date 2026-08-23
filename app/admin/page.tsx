'use client'

import {
  FormEvent,
  useEffect,
  useState,
} from 'react'

type Player = {
  id: string
  name: string
}

type LoggedInPlayer = {
  id: string
  name: string
}

type Week = {
  id: string
  week_number: number
  status: string
  starts_at: string | null
  ends_at: string | null
}

type Vote = {
  player_id: string
  vote: string
}

type Adjustment = {
  id: string
  target_player_id: string
  requested_by_player_id: string
  wins_delta: number
  losses_delta: number
  pushes_delta: number
  reason: string
  status: string
  created_at: string
  adjustment_votes: Vote[]
}

function isoToLocalInput(
  iso: string | null
) {
  if (!iso) {
    return ''
  }

  const date =
    new Date(iso)

  const offset =
    date.getTimezoneOffset()

  const local =
    new Date(
      date.getTime() -
        offset * 60 * 1000
    )

  return local
    .toISOString()
    .slice(0, 16)
}

export default function AdminPage() {
  const [players, setPlayers] =
    useState<Player[]>([])

  const [
    loggedInPlayer,
    setLoggedInPlayer,
  ] =
    useState<LoggedInPlayer | null>(
      null
    )

  const [week, setWeek] =
    useState<Week | null>(null)

  const [
    adjustments,
    setAdjustments,
  ] =
    useState<Adjustment[]>([])

  const [
    targetPlayerId,
    setTargetPlayerId,
  ] =
    useState('')

  const [
    winsDelta,
    setWinsDelta,
  ] =
    useState(0)

  const [
    lossesDelta,
    setLossesDelta,
  ] =
    useState(0)

  const [
    pushesDelta,
    setPushesDelta,
  ] =
    useState(0)

  const [reason, setReason] =
    useState('')

  const [
    weekStartsAt,
    setWeekStartsAt,
  ] =
    useState('')

  const [
    weekEndsAt,
    setWeekEndsAt,
  ] =
    useState('')

  const [message, setMessage] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  async function loadData() {
    try {
      const response =
        await fetch(
          '/api/admin/data',
          {
            cache: 'no-store',
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
          `Admin data returned an unexpected response (${response.status}).`
        )
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'Unable to load admin data.'
        )
      }

      setPlayers(
        data.players ?? []
      )

      setLoggedInPlayer(
        data.loggedInPlayer ??
          null
      )

      setWeek(
        data.week ?? null
      )

      setAdjustments(
        data.adjustments ?? []
      )

      if (data.week) {
        setWeekStartsAt(
          isoToLocalInput(
            data.week.starts_at
          )
        )

        setWeekEndsAt(
          isoToLocalInput(
            data.week.ends_at
          )
        )
      }

      if (
        data.players?.length > 0
      ) {
        setTargetPlayerId(
          (current) =>
            current ||
            data.players[0].id
        )
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load admin data.'
      )
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function runAction(
    url: string,
    label: string
  ) {
    try {
      setLoading(true)

      setMessage(
        `${label}...`
      )

      const response =
        await fetch(
          url,
          {
            method: 'POST',
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
        throw new Error(
          data.error ||
            `${label} failed.`
        )
      }

      setMessage(
        `${label} completed successfully.`
      )

      await loadData()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `${label} failed.`
      )
    } finally {
      setLoading(false)
    }
  }

  async function updateWeekWindow(
    event: FormEvent
  ) {
    event.preventDefault()

    if (!week) {
      setMessage(
        'No active week was found.'
      )

      return
    }

    if (
      !weekStartsAt ||
      !weekEndsAt
    ) {
      setMessage(
        'Start and end times are required.'
      )

      return
    }

    try {
      setLoading(true)
      setMessage('')

      const response =
        await fetch(
          '/api/admin/week-window',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                weekId:
                  week.id,

                startsAt:
                  new Date(
                    weekStartsAt
                  ).toISOString(),

                endsAt:
                  new Date(
                    weekEndsAt
                  ).toISOString(),
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
          `Unexpected response (${response.status}).`
        )
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'Unable to update week window.'
        )
      }

      setMessage(
        data.message ||
          'Week window updated.'
      )

      await loadData()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to update week window.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function submitAdjustment(
    event: FormEvent
  ) {
    event.preventDefault()

    if (!week) {
      setMessage(
        'No active week was found.'
      )

      return
    }

    try {
      setLoading(true)
      setMessage('')

      const response =
        await fetch(
          '/api/admin/adjustments',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                weekId:
                  week.id,

                targetPlayerId,

                winsDelta:
                  Number(
                    winsDelta
                  ),

                lossesDelta:
                  Number(
                    lossesDelta
                  ),

                pushesDelta:
                  Number(
                    pushesDelta
                  ),

                reason,
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
          `Unexpected response (${response.status}).`
        )
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'Unable to create adjustment.'
        )
      }

      setWinsDelta(0)
      setLossesDelta(0)
      setPushesDelta(0)
      setReason('')

      setMessage(
        data.message ||
          'Adjustment request created.'
      )

      await loadData()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to create adjustment.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function vote(
    adjustmentId: string,
    voteValue:
      | 'yes'
      | 'no'
  ) {
    try {
      setLoading(true)
      setMessage('')

      const response =
        await fetch(
          '/api/admin/vote',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                adjustmentId,
                vote:
                  voteValue,
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
          `Unexpected response (${response.status}).`
        )
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'Unable to record vote.'
        )
      }

      setMessage(
        data.message ||
          'Vote recorded.'
      )

      await loadData()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to record vote.'
      )
    } finally {
      setLoading(false)
    }
  }

  function playerName(
    id: string
  ) {
    return (
      players.find(
        (player) =>
          player.id === id
      )?.name ?? 'Unknown'
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">

      <div className="mx-auto max-w-5xl">

        {/* HEADER */}

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">

          <div>

            <h1 className="text-3xl font-black sm:text-4xl">
              Spread Wars Admin
            </h1>

            <p className="mt-1 text-slate-400">
              Week{' '}
              {week?.week_number ??
                '—'}
            </p>

          </div>

          {loggedInPlayer && (
            <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">

              <div className="text-xs uppercase text-slate-500">
                Signed In
              </div>

              <div className="font-black text-emerald-400">
                {
                  loggedInPlayer.name
                }
              </div>

            </div>
          )}

        </div>

        {/* MESSAGE */}

        {message && (
          <div className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">
            {message}
          </div>
        )}

        {/* WEEK WINDOW */}

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">

          <h2 className="text-xl font-black">
            Week Game Window
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Only games inside this window appear on the draft board and qualify for automatic Penn State and Miami picks.
          </p>

          <form
            onSubmit={
              updateWeekWindow
            }
            className="mt-6 grid gap-4 md:grid-cols-2"
          >

            <div>

              <label className="mb-2 block text-sm font-bold text-slate-300">
                Starts
              </label>

              <input
                type="datetime-local"
                value={
                  weekStartsAt
                }
                onChange={(
                  event
                ) =>
                  setWeekStartsAt(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-slate-950"
              />

            </div>

            <div>

              <label className="mb-2 block text-sm font-bold text-slate-300">
                Ends
              </label>

              <input
                type="datetime-local"
                value={
                  weekEndsAt
                }
                onChange={(
                  event
                ) =>
                  setWeekEndsAt(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-slate-950"
              />

            </div>

            <div className="md:col-span-2">

              <button
                type="submit"
                disabled={
                  loading ||
                  !week
                }
                className="w-full rounded-xl bg-emerald-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50 sm:w-auto"
              >
                Save Week Window
              </button>

            </div>

          </form>

        </section>

        {/* SYSTEM */}

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">

          <h2 className="text-xl font-black">
            System
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Odds, automatic picks, and results are handled automatically. These controls are mainly for troubleshooting.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

            <button
              type="button"
              onClick={() =>
                runAction(
                  '/api/sync',
                  'Odds sync'
                )
              }
              disabled={loading}
              className="rounded-xl bg-slate-800 px-4 py-3 font-bold hover:bg-slate-700 disabled:opacity-50"
            >
              Sync Odds
            </button>

            <button
              type="button"
              onClick={() =>
                runAction(
                  '/api/automatic-picks',
                  'Automatic picks'
                )
              }
              disabled={loading}
              className="rounded-xl bg-slate-800 px-4 py-3 font-bold hover:bg-slate-700 disabled:opacity-50"
            >
              Automatic Picks
            </button>

            <button
              type="button"
              onClick={() =>
                runAction(
                  '/api/results',
                  'Results sync'
                )
              }
              disabled={loading}
              className="rounded-xl bg-slate-800 px-4 py-3 font-bold hover:bg-slate-700 disabled:opacity-50"
            >
              Grade Results
            </button>

            <button
              type="button"
              onClick={() =>
                runAction(
                  '/api/rollover',
                  'Week rollover'
                )
              }
              disabled={loading}
              className="rounded-xl bg-red-900/60 px-4 py-3 font-bold text-red-100 hover:bg-red-800 disabled:opacity-50"
            >
              Finalize Week
            </button>

          </div>

        </section>

        {/* REQUEST ADJUSTMENT */}

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">

          <h2 className="text-xl font-black">
            Request Record Adjustment
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            This request will automatically be recorded as coming from{' '}
            <strong className="text-slate-200">
              {loggedInPlayer?.name ??
                'the signed-in player'}
            </strong>.
          </p>

          <form
            onSubmit={
              submitAdjustment
            }
            className="mt-6 space-y-5"
          >

            {/* PLAYER */}

            <div>

              <label className="mb-2 block text-sm font-bold text-slate-300">
                Adjust Player
              </label>

              <select
                value={
                  targetPlayerId
                }
                onChange={(
                  event
                ) =>
                  setTargetPlayerId(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-slate-950"
              >

                {players.map(
                  (player) => (
                    <option
                      key={
                        player.id
                      }
                      value={
                        player.id
                      }
                    >
                      {
                        player.name
                      }
                    </option>
                  )
                )}

              </select>

            </div>

            {/* RECORD CHANGES */}

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">

              <div className="mb-4">

                <h3 className="font-black">
                  Record Changes
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  Use positive or negative whole numbers.
                </p>

              </div>

              <div className="grid gap-4 md:grid-cols-3">

                <div>

                  <label className="mb-2 block text-sm font-bold text-slate-300">
                    Wins Change
                  </label>

                  <input
                    type="number"
                    step="1"
                    value={
                      winsDelta
                    }
                    onChange={(
                      event
                    ) =>
                      setWinsDelta(
                        Number(
                          event.target.value
                        )
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-lg font-bold text-slate-950"
                  />

                </div>

                <div>

                  <label className="mb-2 block text-sm font-bold text-slate-300">
                    Losses Change
                  </label>

                  <input
                    type="number"
                    step="1"
                    value={
                      lossesDelta
                    }
                    onChange={(
                      event
                    ) =>
                      setLossesDelta(
                        Number(
                          event.target.value
                        )
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-lg font-bold text-slate-950"
                  />

                </div>

                <div>

                  <label className="mb-2 block text-sm font-bold text-slate-300">
                    Pushes Change
                  </label>

                  <input
                    type="number"
                    step="1"
                    value={
                      pushesDelta
                    }
                    onChange={(
                      event
                    ) =>
                      setPushesDelta(
                        Number(
                          event.target.value
                        )
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-lg font-bold text-slate-950"
                  />

                </div>

              </div>

            </div>

            {/* REASON */}

            <div>

              <label className="mb-2 block text-sm font-bold text-slate-300">
                Reason
              </label>

              <textarea
                required
                value={
                  reason
                }
                onChange={(
                  event
                ) =>
                  setReason(
                    event.target.value
                  )
                }
                placeholder="Why is this adjustment needed?"
                className="min-h-28 w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-slate-950"
              />

            </div>

            <button
              type="submit"
              disabled={
                loading ||
                !week ||
                !targetPlayerId
              }
              className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950 hover:bg-cyan-400 disabled:opacity-50 sm:w-auto"
            >
              Submit Adjustment
            </button>

          </form>

        </section>

        {/* ADJUSTMENT VOTES */}

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">

          <h2 className="text-xl font-black">
            Adjustment Votes
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Both players must vote YES for an adjustment to count. Any NO vote rejects it.
          </p>

          {adjustments.length ===
          0 ? (
            <p className="mt-5 text-slate-500">
              No adjustment requests.
            </p>
          ) : (
            <div className="mt-5 space-y-4">

              {adjustments.map(
                (adjustment) => {
                  const myVote =
                    adjustment.adjustment_votes.find(
                      (item) =>
                        item.player_id ===
                        loggedInPlayer?.id
                    )

                  return (
                    <div
                      key={
                        adjustment.id
                      }
                      className="rounded-2xl border border-slate-700 bg-slate-800 p-5"
                    >

                      <div className="flex flex-wrap items-start justify-between gap-4">

                        <div>

                          <div className="text-lg font-black">
                            {playerName(
                              adjustment.target_player_id
                            )}
                          </div>

                          <div className="mt-1 text-sm text-slate-400">
                            Requested by{' '}
                            {playerName(
                              adjustment.requested_by_player_id
                            )}
                          </div>

                        </div>

                        <div
                          className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                            adjustment.status ===
                            'approved'
                              ? 'bg-emerald-950 text-emerald-400'
                              : adjustment.status ===
                                'rejected'
                              ? 'bg-red-950 text-red-400'
                              : 'bg-slate-950 text-slate-300'
                          }`}
                        >
                          {
                            adjustment.status
                          }
                        </div>

                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">

                        <div className="rounded-xl bg-slate-900 p-3 text-center">

                          <div className="text-xs uppercase text-slate-500">
                            Wins
                          </div>

                          <div className="mt-1 text-lg font-black">
                            {adjustment.wins_delta >=
                            0
                              ? '+'
                              : ''}
                            {
                              adjustment.wins_delta
                            }
                          </div>

                        </div>

                        <div className="rounded-xl bg-slate-900 p-3 text-center">

                          <div className="text-xs uppercase text-slate-500">
                            Losses
                          </div>

                          <div className="mt-1 text-lg font-black">
                            {adjustment.losses_delta >=
                            0
                              ? '+'
                              : ''}
                            {
                              adjustment.losses_delta
                            }
                          </div>

                        </div>

                        <div className="rounded-xl bg-slate-900 p-3 text-center">

                          <div className="text-xs uppercase text-slate-500">
                            Pushes
                          </div>

                          <div className="mt-1 text-lg font-black">
                            {adjustment.pushes_delta >=
                            0
                              ? '+'
                              : ''}
                            {
                              adjustment.pushes_delta
                            }
                          </div>

                        </div>

                      </div>

                      <div className="mt-4 rounded-xl bg-slate-900 p-4">

                        <div className="text-xs font-bold uppercase text-slate-500">
                          Reason
                        </div>

                        <div className="mt-1 text-sm text-slate-200">
                          {
                            adjustment.reason
                          }
                        </div>

                      </div>

                      {myVote && (
                        <div className="mt-4 text-sm text-slate-400">
                          Your vote:{' '}
                          <strong
                            className={`uppercase ${
                              myVote.vote ===
                              'yes'
                                ? 'text-emerald-400'
                                : 'text-red-400'
                            }`}
                          >
                            {
                              myVote.vote
                            }
                          </strong>
                        </div>
                      )}

                      {adjustment.status ===
                        'pending' &&
                        !myVote && (
                          <div className="mt-4 grid grid-cols-2 gap-3">

                            <button
                              type="button"
                              onClick={() =>
                                vote(
                                  adjustment.id,
                                  'yes'
                                )
                              }
                              disabled={
                                loading
                              }
                              className="rounded-xl bg-emerald-700 px-4 py-3 font-black hover:bg-emerald-600 disabled:opacity-50"
                            >
                              YES
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                vote(
                                  adjustment.id,
                                  'no'
                                )
                              }
                              disabled={
                                loading
                              }
                              className="rounded-xl bg-red-800 px-4 py-3 font-black hover:bg-red-700 disabled:opacity-50"
                            >
                              NO
                            </button>

                          </div>
                        )}

                    </div>
                  )
                }
              )}

            </div>
          )}

        </section>

        {/* BOTTOM BACK BUTTON */}

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