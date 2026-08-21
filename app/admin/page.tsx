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

      const data =
        await response.json()

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

                winsDelta,

                lossesDelta,

                pushesDelta,

                reason,
              }),
          }
        )

      const data =
        await response.json()

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
          'Adjustment created.'
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

      const data =
        await response.json()

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
    <main className="min-h-screen bg-slate-950 p-6 text-white">

      <div className="mx-auto max-w-5xl">

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">

          <div>

            <a
              href="/"
              className="text-sm font-bold text-cyan-400"
            >
              ← Back to Spread Wars
            </a>

            <h1 className="mt-5 text-4xl font-black">
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

        {message && (
          <div className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4">
            {message}
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <h2 className="text-xl font-black">
            Week Game Window
          </h2>

          <form
            onSubmit={
              updateWeekWindow
            }
            className="mt-6 grid gap-4 md:grid-cols-2"
          >

            <div>

              <label className="mb-2 block text-sm font-bold">
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
                className="w-full rounded-xl bg-white px-4 py-3 text-slate-950"
              />

            </div>

            <div>

              <label className="mb-2 block text-sm font-bold">
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
                className="w-full rounded-xl bg-white px-4 py-3 text-slate-950"
              />

            </div>

            <div className="md:col-span-2">

              <button
                type="submit"
                disabled={
                  loading
                }
                className="rounded-xl bg-emerald-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50"
              >
                Save Week Window
              </button>

            </div>

          </form>

        </section>

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <h2 className="text-xl font-black">
            System
          </h2>

          <div className="mt-5 flex flex-wrap gap-3">

            <button
              onClick={() =>
                runAction(
                  '/api/sync',
                  'Odds sync'
                )
              }
              disabled={loading}
              className="rounded-xl bg-slate-800 px-4 py-3 font-bold"
            >
              Sync Odds
            </button>

            <button
              onClick={() =>
                runAction(
                  '/api/automatic-picks',
                  'Automatic picks'
                )
              }
              disabled={loading}
              className="rounded-xl bg-slate-800 px-4 py-3 font-bold"
            >
              Automatic Picks
            </button>

            <button
              onClick={() =>
                runAction(
                  '/api/results',
                  'Results sync'
                )
              }
              disabled={loading}
              className="rounded-xl bg-slate-800 px-4 py-3 font-bold"
            >
              Grade Results
            </button>

            <button
              onClick={() =>
                runAction(
                  '/api/rollover',
                  'Week rollover'
                )
              }
              disabled={loading}
              className="rounded-xl bg-red-900/50 px-4 py-3 font-bold text-red-200"
            >
              Finalize Week
            </button>

          </div>

        </section>

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <h2 className="text-xl font-black">
            Request Record Adjustment
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            The request will automatically be recorded as coming from{' '}
            <strong>
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

            <div>

              <label className="mb-2 block text-sm font-bold">
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
                className="w-full rounded-xl bg-white px-4 py-3 text-slate-950"
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

            <div className="grid gap-4 md:grid-cols-3">

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
                      event.target.value
                    )
                  )
                }
                placeholder="Wins"
                className="rounded-xl bg-white px-4 py-3 text-slate-950"
              />

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
                      event.target.value
                    )
                  )
                }
                placeholder="Losses"
                className="rounded-xl bg-white px-4 py-3 text-slate-950"
              />

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
                      event.target.value
                    )
                  )
                }
                placeholder="Pushes"
                className="rounded-xl bg-white px-4 py-3 text-slate-950"
              />

            </div>

            <textarea
              required
              value={reason}
              onChange={(
                event
              ) =>
                setReason(
                  event.target.value
                )
              }
              placeholder="Reason"
              className="min-h-24 w-full rounded-xl bg-white px-4 py-3 text-slate-950"
            />

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950"
            >
              Submit Adjustment
            </button>

          </form>

        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <h2 className="text-xl font-black">
            Adjustment Votes
          </h2>

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
                      className="rounded-xl bg-slate-800 p-5"
                    >

                      <div className="font-black">
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

                      <div className="mt-3">
                        W{' '}
                        {
                          adjustment.wins_delta
                        }{' '}
                        · L{' '}
                        {
                          adjustment.losses_delta
                        }{' '}
                        · P{' '}
                        {
                          adjustment.pushes_delta
                        }
                      </div>

                      <div className="mt-2 text-sm">
                        {
                          adjustment.reason
                        }
                      </div>

                      <div className="mt-4 text-xs font-bold uppercase text-slate-400">
                        Status:{' '}
                        {
                          adjustment.status
                        }
                      </div>

                      {myVote && (
                        <div className="mt-2 text-sm text-slate-400">
                          Your vote:{' '}
                          <strong className="uppercase">
                            {
                              myVote.vote
                            }
                          </strong>
                        </div>
                      )}

                      {adjustment.status ===
                        'pending' &&
                        !myVote && (
                          <div className="mt-4 flex gap-2">

                            <button
                              onClick={() =>
                                vote(
                                  adjustment.id,
                                  'yes'
                                )
                              }
                              disabled={loading}
                              className="rounded-lg bg-emerald-700 px-4 py-2 font-bold"
                            >
                              YES
                            </button>

                            <button
                              onClick={() =>
                                vote(
                                  adjustment.id,
                                  'no'
                                )
                              }
                              disabled={loading}
                              className="rounded-lg bg-red-800 px-4 py-2 font-bold"
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

      </div>

    </main>
  )
}