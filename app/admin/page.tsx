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
    requestedByPlayerId,
    setRequestedByPlayerId,
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

  // --------------------------------------------------
  // LOAD ADMIN DATA
  // --------------------------------------------------

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

        setRequestedByPlayerId(
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

  // --------------------------------------------------
  // GENERIC SYSTEM ACTION
  // --------------------------------------------------

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

  // --------------------------------------------------
  // UPDATE WEEK WINDOW
  // --------------------------------------------------

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
        'Start and end dates are required.'
      )

      return
    }

    try {
      setLoading(true)
      setMessage('')

      const startsAt =
        new Date(
          weekStartsAt
        ).toISOString()

      const endsAt =
        new Date(
          weekEndsAt
        ).toISOString()

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

                startsAt,
                endsAt,
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

  // --------------------------------------------------
  // SUBMIT ADJUSTMENT
  // --------------------------------------------------

  async function submitAdjustment(
    event: FormEvent
  ) {
    event.preventDefault()

    if (!week) {
      setMessage(
        'No active week.'
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

                requestedByPlayerId,

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

      setReason('')
      setWinsDelta(0)
      setLossesDelta(0)
      setPushesDelta(0)

      setMessage(
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

  // --------------------------------------------------
  // VOTE
  // --------------------------------------------------

  async function vote(
    adjustmentId: string,
    playerId: string,
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
                playerId,
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

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">

      <div className="mx-auto max-w-5xl">

        {/* HEADER */}

        <div className="mb-8">

          <a
            href="/"
            className="text-sm font-bold text-cyan-400 hover:text-cyan-300"
          >
            ← Back to Spread Wars
          </a>

          <h1 className="mt-5 text-4xl font-black">
            Spread Wars Admin
          </h1>

          <p className="mt-1 text-slate-400">
            Week{' '}
            {week?.week_number ??
              '—'}{' '}
            ·{' '}
            {week?.status ??
              'No active week'}
          </p>

        </div>

        {/* MESSAGE */}

        {message && (
          <div className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">
            {message}
          </div>
        )}

        {/* WEEK GAME WINDOW */}

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <h2 className="text-xl font-black">
            Week Game Window
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Only games inside this time window appear on the draft board and qualify for the automatic Penn State and Miami picks.
          </p>

          <form
            onSubmit={
              updateWeekWindow
            }
            className="mt-6 grid gap-4 md:grid-cols-2"
          >

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Week Starts
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
                    event.target
                      .value
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-slate-950"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Week Ends
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
                    event.target
                      .value
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
                className="rounded-xl bg-emerald-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50"
              >
                Save Week Window
              </button>

            </div>

          </form>

        </section>

        {/* SYSTEM ACTIONS */}

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <h2 className="text-xl font-black">
            System Actions
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Scheduled jobs now handle odds, automatic picks, and results. These buttons are mainly for troubleshooting.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">

            <button
              type="button"
              onClick={() =>
                runAction(
                  '/api/sync',
                  'Odds sync'
                )
              }
              disabled={loading}
              className="rounded-xl bg-cyan-600 px-4 py-4 font-black hover:bg-cyan-500 disabled:opacity-50"
            >
              Sync DraftKings Odds
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
              className="rounded-xl bg-violet-600 px-4 py-4 font-black hover:bg-violet-500 disabled:opacity-50"
            >
              Refresh Automatic Picks
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
              className="rounded-xl bg-emerald-600 px-4 py-4 font-black hover:bg-emerald-500 disabled:opacity-50"
            >
              Check Results
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
              className="rounded-xl bg-orange-600 px-4 py-4 font-black hover:bg-orange-500 disabled:opacity-50"
            >
              Finalize Week
            </button>

          </div>

        </section>

        {/* REQUEST ADJUSTMENT */}

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <h2 className="text-xl font-black">
            Request Record Adjustment
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Both players must approve before an adjustment counts.
          </p>

          <form
            onSubmit={
              submitAdjustment
            }
            className="mt-6 space-y-5"
          >

            <div className="grid gap-4 md:grid-cols-2">

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
                      event.target
                        .value
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

              <div>

                <label className="mb-2 block text-sm font-bold text-slate-300">
                  Requested By
                </label>

                <select
                  value={
                    requestedByPlayerId
                  }
                  onChange={(
                    event
                  ) =>
                    setRequestedByPlayerId(
                      event.target
                        .value
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

            </div>

            <div className="grid gap-4 md:grid-cols-3">

              <div>

                <label className="mb-2 block text-sm font-bold text-slate-300">
                  Wins Change
                </label>

                <input
                  type="number"
                  value={
                    winsDelta
                  }
                  onChange={(
                    event
                  ) =>
                    setWinsDelta(
                      Number(
                        event.target
                          .value
                      )
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-slate-950"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm font-bold text-slate-300">
                  Losses Change
                </label>

                <input
                  type="number"
                  value={
                    lossesDelta
                  }
                  onChange={(
                    event
                  ) =>
                    setLossesDelta(
                      Number(
                        event.target
                          .value
                      )
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-slate-950"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm font-bold text-slate-300">
                  Pushes Change
                </label>

                <input
                  type="number"
                  value={
                    pushesDelta
                  }
                  onChange={(
                    event
                  ) =>
                    setPushesDelta(
                      Number(
                        event.target
                          .value
                      )
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-slate-950"
                />

              </div>

            </div>

            <div>

              <label className="mb-2 block text-sm font-bold text-slate-300">
                Reason
              </label>

              <textarea
                required
                value={reason}
                onChange={(
                  event
                ) =>
                  setReason(
                    event.target
                      .value
                  )
                }
                className="min-h-24 w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-slate-950"
                placeholder="Why is this adjustment needed?"
              />

            </div>

            <button
              type="submit"
              disabled={
                loading ||
                !week
              }
              className="rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50"
            >
              Submit Adjustment
            </button>

          </form>

        </section>

        {/* ADJUSTMENT VOTES */}

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <h2 className="text-xl font-black">
            Adjustment Votes
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Two YES votes approve an adjustment. Any NO vote rejects it.
          </p>

          {adjustments.length ===
          0 ? (
            <p className="mt-6 text-slate-500">
              No adjustment requests.
            </p>
          ) : (
            <div className="mt-6 space-y-4">

              {adjustments.map(
                (adjustment) => (
                  <div
                    key={
                      adjustment.id
                    }
                    className="rounded-xl border border-slate-700 bg-slate-800 p-5"
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

                        <div className="mt-3 text-sm">

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

                        <div className="mt-3 text-sm text-slate-300">
                          {
                            adjustment.reason
                          }
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

                    <div className="mt-5 grid gap-3 md:grid-cols-2">

                      {players.map(
                        (player) => {
                          const existingVote =
                            adjustment.adjustment_votes.find(
                              (vote) =>
                                vote.player_id ===
                                player.id
                            )

                          return (
                            <div
                              key={
                                player.id
                              }
                              className="rounded-xl bg-slate-900 p-4"
                            >

                              <div className="mb-3 flex items-center justify-between">

                                <strong>
                                  {
                                    player.name
                                  }
                                </strong>

                                <span
                                  className={`text-sm font-bold uppercase ${
                                    existingVote?.vote ===
                                    'yes'
                                      ? 'text-emerald-400'
                                      : existingVote?.vote ===
                                        'no'
                                      ? 'text-red-400'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {existingVote?.vote ??
                                    'No vote'}
                                </span>

                              </div>

                              {adjustment.status ===
                                'pending' && (
                                <div className="flex gap-2">

                                  <button
                                    type="button"
                                    disabled={
                                      loading
                                    }
                                    onClick={() =>
                                      vote(
                                        adjustment.id,
                                        player.id,
                                        'yes'
                                      )
                                    }
                                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black hover:bg-emerald-600 disabled:opacity-50"
                                  >
                                    YES
                                  </button>

                                  <button
                                    type="button"
                                    disabled={
                                      loading
                                    }
                                    onClick={() =>
                                      vote(
                                        adjustment.id,
                                        player.id,
                                        'no'
                                      )
                                    }
                                    className="rounded-lg bg-red-800 px-4 py-2 text-sm font-black hover:bg-red-700 disabled:opacity-50"
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

                  </div>
                )
              )}

            </div>
          )}

        </section>

      </div>

    </main>
  )
}