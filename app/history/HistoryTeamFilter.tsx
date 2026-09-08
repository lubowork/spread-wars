'use client'

import {
  useRouter,
  useSearchParams,
} from 'next/navigation'

type Props = {
  teams: string[]
  selectedTeam: string
  weekNumber: number
}

export default function HistoryTeamFilter({
  teams,
  selectedTeam,
  weekNumber,
}: Props) {
  const router =
    useRouter()

  const searchParams =
    useSearchParams()

  function handleTeamChange(
    team: string
  ) {
    const params =
      new URLSearchParams(
        searchParams.toString()
      )

    params.set(
      'week',
      String(
        weekNumber
      )
    )

    if (team) {
      params.set(
        'team',
        team
      )
    } else {
      params.delete(
        'team'
      )
    }

    router.push(
      `/history?${params.toString()}`
    )
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">

      <label
        htmlFor="history-team-filter"
        className="mb-2 block text-sm font-black text-slate-200"
      >
        Find a Team
      </label>

      <select
        id="history-team-filter"
        value={
          selectedTeam
        }
        onChange={(
          event
        ) =>
          handleTeamChange(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-base font-bold text-slate-950"
      >

        <option value="">
          All Teams
        </option>

        {teams.map(
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

      <p className="mt-3 text-xs text-slate-500">
        Select a school to immediately show every picked matchup involving that team.
      </p>

    </div>
  )
}