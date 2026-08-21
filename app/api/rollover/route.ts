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
  const playerPicks =
    picks.filter(
      (pick) =>
        pick.player_id ===
        playerId
    )

  const wins =
    playerPicks.filter(
      (pick) =>
        pick.result === 'win'
    ).length

  const losses =
    playerPicks.filter(
      (pick) =>
        pick.result === 'loss'
    ).length

  const pushes =
    playerPicks.filter(
      (pick) =>
        pick.result === 'push'
    ).length

  const decisions =
    wins + losses

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
    record.wins +
    record.losses

  record.winPct =
    decisions > 0
      ? record.wins /
        decisions
      : 0
}

export async function POST() {
  try {
    const supabase =
      createAdminClient()

    // --------------------------------------------------
    // 1. CURRENT ACTIVE WEEK
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
      .eq(
        'status',
        'active'
      )
      .order(
        'week_number',
        {
          ascending: false,
        }
      )
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
    // 2. REQUIRE WEEK WINDOW
    // --------------------------------------------------

    if (
      !currentWeek.starts_at ||
      !currentWeek.ends_at
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The current week must have starts_at and ends_at configured before rollover.',
        },
        { status: 400 }
      )
    }

    // --------------------------------------------------
    // 3. PLAYERS
    // --------------------------------------------------

    const {
      data: players,
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
    // 4. PICKS
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
    // 5. ALL PICKS MUST BE FINAL
    // --------------------------------------------------

    const pendingPicks =
      picks.filter(
        (pick) =>
          pick.result ===
          'pending'
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
    // 6. APPROVED ADJUSTMENTS
    // --------------------------------------------------

    const {
      data: adjustments,
      error: adjustmentsError,
    } = await supabase
      .from(
        'result_adjustments'
      )
      .select(`
        id,
        target_player_id,
        wins_delta,
        losses_delta,
        pushes_delta
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
    // 7. BASE RECORDS
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
    // 8. APPLY APPROVED ADJUSTMENTS
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
    // 9. PREVENT NEGATIVE RECORDS
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
            'An approved adjustment produced a negative record. Fix it before finalizing the week.',
        },
        { status: 400 }
      )
    }

    // --------------------------------------------------
    // 10. DETERMINE NEXT FIRST PICKER
    //
    // Worse winning percentage goes first.
    //
    // Tie:
    // whoever picked second this week
    // goes first next week.
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
          'Unable to determine tie-break draft order.'
        )
      }

      nextFirstPickerId =
        secondPicker.id

      decisionReason =
        'Records tied; previous second picker moves to first'
    }

    // --------------------------------------------------
    // 11. NEXT WEEK NUMBER
    // --------------------------------------------------

    const nextWeekNumber =
      currentWeek.week_number + 1

    // --------------------------------------------------
    // 12. MAKE SURE NEXT WEEK DOES NOT EXIST
    // --------------------------------------------------

    const {
      data: existingNextWeek,
      error: existingError,
    } = await supabase
      .from('weeks')
      .select(`
        id,
        week_number,
        status
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
        },
        { status: 409 }
      )
    }

    // --------------------------------------------------
    // 13. CREATE NEXT WEEK WINDOW
    //
    // Current Week 1:
    // Tue Sep 1 -> Tue Sep 8
    //
    // Week 2 becomes:
    // Tue Sep 8 -> Tue Sep 15
    // --------------------------------------------------

    const nextStartsAt =
      new Date(
        currentWeek.ends_at
      )

    const nextEndsAt =
      new Date(
        nextStartsAt.getTime() +
          7 *
            24 *
            60 *
            60 *
            1000
      )

    // --------------------------------------------------
    // 14. CREATE NEXT WEEK
    //
    // IMPORTANT:
    // New week becomes ACTIVE immediately.
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
          'active',

        starts_at:
          nextStartsAt.toISOString(),

        ends_at:
          nextEndsAt.toISOString(),
      })
      .select(`
        id,
        week_number,
        first_picker_id,
        status,
        starts_at,
        ends_at
      `)
      .single()

    if (createError) {
      throw new Error(
        createError.message
      )
    }

    // --------------------------------------------------
    // 15. CLOSE OLD WEEK
    // --------------------------------------------------

    const {
      error: closeError,
    } = await supabase
      .from('weeks')
      .update({
        status:
          'complete',
      })
      .eq(
        'id',
        currentWeek.id
      )

    if (closeError) {
      // Roll back the new week if
      // closing the old week fails.
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
    // 16. RESPONSE DETAILS
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
        adjustments?.length ??
        0,

      nextWeek: {
        weekNumber:
          newWeek.week_number,

        status:
          newWeek.status,

        startsAt:
          newWeek.starts_at,

        endsAt:
          newWeek.ends_at,

        firstPicker:
          nextFirstPicker?.name,
      },

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