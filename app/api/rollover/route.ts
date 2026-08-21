import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

type PickResult = {
  player_id: string
  result: string
}

type RecordSummary = {
  playerId: string
  wins: number
  losses: number
  pushes: number
  winPct: number
}

function calculateRecord(
  playerId: string,
  picks: PickResult[]
): RecordSummary {
  const playerPicks = picks.filter(
    (pick) => pick.player_id === playerId
  )

  const wins = playerPicks.filter(
    (pick) => pick.result === 'win'
  ).length

  const losses = playerPicks.filter(
    (pick) => pick.result === 'loss'
  ).length

  const pushes = playerPicks.filter(
    (pick) => pick.result === 'push'
  ).length

  const decisions = wins + losses

  const winPct =
    decisions > 0
      ? wins / decisions
      : 0

  return {
    playerId,
    wins,
    losses,
    pushes,
    winPct,
  }
}

function recalculateWinPct(
  record: RecordSummary
) {
  const decisions =
    record.wins + record.losses

  record.winPct =
    decisions > 0
      ? record.wins / decisions
      : 0
}

export async function POST() {
  try {
    const supabase = createAdminClient()

    // --------------------------------------------------
    // 1. GET CURRENT ACTIVE WEEK
    // --------------------------------------------------

    const {
      data: currentWeek,
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
      .eq('status', 'active')
      .order('week_number', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle()

    if (weekError) {
      throw new Error(
        weekError.message
      )
    }

    if (!currentWeek) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No active week was found.',
        },
        { status: 404 }
      )
    }

    // --------------------------------------------------
    // 2. GET PLAYERS
    // --------------------------------------------------

    const {
      data: players,
      error: playersError,
    } = await supabase
      .from('players')
      .select(
        'id, name'
      )
      .order('name')

    if (playersError) {
      throw new Error(
        playersError.message
      )
    }

    if (
      !players ||
      players.length !== 2
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Exactly two players are required.',
        },
        { status: 500 }
      )
    }

    // --------------------------------------------------
    // 3. GET PICKS
    // --------------------------------------------------

    const {
      data: picks,
      error: picksError,
    } = await supabase
      .from('picks')
      .select(`
        id,
        player_id,
        result,
        is_automatic
      `)
      .eq(
        'week_id',
        currentWeek.id
      )

    if (picksError) {
      throw new Error(
        picksError.message
      )
    }

    if (
      !picks ||
      picks.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'There are no picks for this week.',
        },
        { status: 400 }
      )
    }

    // --------------------------------------------------
    // 4. REFUSE ROLLOVER IF PICKS ARE PENDING
    // --------------------------------------------------

    const pendingPicks =
      picks.filter(
        (pick) =>
          pick.result === 'pending'
      )

    if (
      pendingPicks.length > 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `${pendingPicks.length} picks are still pending.`,
          pendingPicks:
            pendingPicks.length,
        },
        { status: 400 }
      )
    }

    // --------------------------------------------------
    // 5. GET APPROVED ADJUSTMENTS
    // --------------------------------------------------

    const {
      data: adjustments,
      error: adjustmentsError,
    } = await supabase
      .from('result_adjustments')
      .select(`
        id,
        target_player_id,
        wins_delta,
        losses_delta,
        pushes_delta,
        status
      `)
      .eq(
        'week_id',
        currentWeek.id
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

    // --------------------------------------------------
    // 6. CALCULATE BASE RECORDS
    // --------------------------------------------------

    const playerOneRecord =
      calculateRecord(
        players[0].id,
        picks
      )

    const playerTwoRecord =
      calculateRecord(
        players[1].id,
        picks
      )

    // --------------------------------------------------
    // 7. APPLY APPROVED ADJUSTMENTS
    // --------------------------------------------------

    for (
      const adjustment of
      adjustments ?? []
    ) {
      let target:
        | RecordSummary
        | null = null

      if (
        adjustment.target_player_id ===
        playerOneRecord.playerId
      ) {
        target =
          playerOneRecord
      }

      if (
        adjustment.target_player_id ===
        playerTwoRecord.playerId
      ) {
        target =
          playerTwoRecord
      }

      if (!target) {
        continue
      }

      target.wins +=
        Number(
          adjustment.wins_delta
        ) || 0

      target.losses +=
        Number(
          adjustment.losses_delta
        ) || 0

      target.pushes +=
        Number(
          adjustment.pushes_delta
        ) || 0

      recalculateWinPct(
        target
      )
    }

    // --------------------------------------------------
    // 8. SAFETY CHECK
    //
    // Do not allow approved adjustments to produce
    // impossible negative totals.
    // --------------------------------------------------

    const invalidRecord =
      [
        playerOneRecord,
        playerTwoRecord,
      ].find(
        (record) =>
          record.wins < 0 ||
          record.losses < 0 ||
          record.pushes < 0
      )

    if (invalidRecord) {
      return NextResponse.json(
        {
          success: false,
          error:
            'An approved adjustment produced a negative record total. Fix the adjustment before finalizing the week.',
        },
        { status: 400 }
      )
    }

    // --------------------------------------------------
    // 9. DETERMINE NEXT FIRST PICKER
    //
    // Worse winning percentage gets first normal pick.
    //
    // If tied:
    // the player who picked second this week
    // gets first pick next week.
    // --------------------------------------------------

    let nextFirstPickerId:
      string

    let decisionReason:
      string

    if (
      playerOneRecord.winPct <
      playerTwoRecord.winPct
    ) {
      nextFirstPickerId =
        playerOneRecord.playerId

      decisionReason =
        'Worse weekly winning percentage'
    } else if (
      playerTwoRecord.winPct <
      playerOneRecord.winPct
    ) {
      nextFirstPickerId =
        playerTwoRecord.playerId

      decisionReason =
        'Worse weekly winning percentage'
    } else {
      const secondPicker =
        players.find(
          (player) =>
            player.id !==
            currentWeek.first_picker_id
        )

      if (!secondPicker) {
        throw new Error(
          'Unable to determine the tie-break first picker.'
        )
      }

      nextFirstPickerId =
        secondPicker.id

      decisionReason =
        'Weekly records tied; previous second picker moves to first'
    }

    // --------------------------------------------------
    // 10. NEXT WEEK NUMBER
    // --------------------------------------------------

    const nextWeekNumber =
      currentWeek.week_number + 1

    // --------------------------------------------------
    // 11. MAKE SURE NEXT WEEK DOES NOT ALREADY EXIST
    // --------------------------------------------------

    const {
      data: existingNextWeek,
      error: existingError,
    } = await supabase
      .from('weeks')
      .select(`
        id,
        week_number,
        status,
        first_picker_id
      `)
      .eq(
        'season_id',
        currentWeek.season_id
      )
      .eq(
        'week_number',
        nextWeekNumber
      )
      .maybeSingle()

    if (existingError) {
      throw new Error(
        existingError.message
      )
    }

    if (existingNextWeek) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Week ${nextWeekNumber} already exists.`,
          existingWeek:
            existingNextWeek,
        },
        { status: 409 }
      )
    }

    // --------------------------------------------------
    // 12. CREATE NEXT WEEK FIRST
    //
    // We create the next week before closing the
    // current week so a failed insert does not leave
    // us with no active/current week structure.
    // --------------------------------------------------

    const {
      data: newWeek,
      error: createError,
    } = await supabase
      .from('weeks')
      .insert({
        season_id:
          currentWeek.season_id,

        week_number:
          nextWeekNumber,

        first_picker_id:
          nextFirstPickerId,

        status:
          'upcoming',

        starts_at:
          null,

        ends_at:
          null,
      })
      .select(`
        id,
        week_number,
        first_picker_id,
        status
      `)
      .single()

    if (createError) {
      throw new Error(
        createError.message
      )
    }

    // --------------------------------------------------
    // 13. CLOSE CURRENT WEEK
    // --------------------------------------------------

    const {
      error: closeError,
    } = await supabase
      .from('weeks')
      .update({
        status: 'complete',
      })
      .eq(
        'id',
        currentWeek.id
      )

    if (closeError) {
      // Undo the newly created week if closing
      // the current week fails.
      await supabase
        .from('weeks')
        .delete()
        .eq(
          'id',
          newWeek.id
        )

      throw new Error(
        closeError.message
      )
    }

    // --------------------------------------------------
    // 14. BUILD RESPONSE
    // --------------------------------------------------

    const playerOne =
      players.find(
        (player) =>
          player.id ===
          playerOneRecord.playerId
      )

    const playerTwo =
      players.find(
        (player) =>
          player.id ===
          playerTwoRecord.playerId
      )

    const nextFirstPicker =
      players.find(
        (player) =>
          player.id ===
          nextFirstPickerId
      )

    return NextResponse.json({
      success: true,

      completedWeek:
        currentWeek.week_number,

      records: [
        {
          player:
            playerOne?.name,

          wins:
            playerOneRecord.wins,

          losses:
            playerOneRecord.losses,

          pushes:
            playerOneRecord.pushes,

          winPct:
            playerOneRecord.winPct,
        },

        {
          player:
            playerTwo?.name,

          wins:
            playerTwoRecord.wins,

          losses:
            playerTwoRecord.losses,

          pushes:
            playerTwoRecord.pushes,

          winPct:
            playerTwoRecord.winPct,
        },
      ],

      approvedAdjustments:
        adjustments?.length ?? 0,

      nextWeek:
        newWeek.week_number,

      nextWeekStatus:
        newWeek.status,

      nextFirstPicker:
        nextFirstPicker?.name,

      reason:
        decisionReason,
    })
  } catch (error) {
    console.error(
      'POST /api/rollover error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unknown rollover error.',
      },
      { status: 500 }
    )
  }
}