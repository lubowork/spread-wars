import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createAdminClient } from '../../../lib/supabase-admin'

type PlayerRecord = {
  playerId: string
  name: string
  wins: number
  losses: number
  pushes: number
  winPct: number
}

export async function POST() {
  try {
    // --------------------------------------------------
    // REQUIRE SIGNED-IN SPREAD WARS PLAYER
    // --------------------------------------------------

    const authSupabase =
      await createClient()

    const {
      data: { user },
      error: userError,
    } =
      await authSupabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'You must be signed in.',
        },
        { status: 401 }
      )
    }

    const supabase =
      createAdminClient()

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

    if (loggedInPlayerError) {
      throw new Error(
        loggedInPlayerError.message
      )
    }

    if (!loggedInPlayer) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your login is not linked to a Spread Wars player.',
        },
        { status: 403 }
      )
    }

    // --------------------------------------------------
    // CURRENT ACTIVE WEEK
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
        starts_at,
        ends_at,
        status
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

    if (
      !currentWeek.starts_at ||
      !currentWeek.ends_at
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The active week must have a start and end time before it can be finalized.',
        },
        { status: 400 }
      )
    }

    // --------------------------------------------------
    // PLAYERS
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
            'Exactly two Spread Wars players are required.',
        },
        { status: 500 }
      )
    }

    // --------------------------------------------------
    // ALL PICKS FOR CURRENT WEEK
    // --------------------------------------------------

    const {
      data: picks,
      error: picksError,
    } = await supabase
      .from('picks')
      .select(`
        id,
        player_id,
        result
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
            'This week has no picks and cannot be finalized.',
        },
        { status: 400 }
      )
    }

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
            `${pendingPicks.length} pick(s) are still pending. Grade all results before finalizing the week.`,
        },
        { status: 400 }
      )
    }

    // --------------------------------------------------
    // APPROVED RECORD ADJUSTMENTS
    // --------------------------------------------------

    const {
      data: adjustments,
      error: adjustmentError,
    } = await supabase
      .from(
        'result_adjustments'
      )
      .select(`
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

    if (adjustmentError) {
      throw new Error(
        adjustmentError.message
      )
    }

    // --------------------------------------------------
    // CALCULATE FINAL WEEK RECORDS
    // --------------------------------------------------

    const records: PlayerRecord[] =
      players.map((player) => {
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
          (adjustments ?? []).filter(
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

        if (
          wins < 0 ||
          losses < 0 ||
          pushes < 0
        ) {
          throw new Error(
            `Approved adjustments would create a negative record for ${player.name}.`
          )
        }

        const decisions =
          wins + losses

        const winPct =
          decisions > 0
            ? wins / decisions
            : 0

        return {
          playerId:
            player.id,

          name:
            player.name,

          wins,
          losses,
          pushes,
          winPct,
        }
      })

    // --------------------------------------------------
    // DETERMINE NEXT WEEK FIRST PICKER
    //
    // Worse record picks first.
    // Pushes do not affect winning percentage.
    //
    // If tied:
    // Whoever picked second this week gets first next week.
    // --------------------------------------------------

    const firstRecord =
      records[0]

    const secondRecord =
      records[1]

    let nextFirstPickerId:
      string

    if (
      firstRecord.winPct <
      secondRecord.winPct
    ) {
      nextFirstPickerId =
        firstRecord.playerId
    } else if (
      secondRecord.winPct <
      firstRecord.winPct
    ) {
      nextFirstPickerId =
        secondRecord.playerId
    } else {
      const playerWhoPickedSecond =
        players.find(
          (player) =>
            player.id !==
            currentWeek.first_picker_id
        )

      if (!playerWhoPickedSecond) {
        throw new Error(
          'Unable to determine the next first picker.'
        )
      }

      nextFirstPickerId =
        playerWhoPickedSecond.id
    }

    // --------------------------------------------------
    // MAKE SURE NEXT WEEK DOES NOT ALREADY EXIST
    // --------------------------------------------------

    const nextWeekNumber =
      currentWeek.week_number +
      1

    const {
      data: existingNextWeek,
      error:
        existingNextWeekError,
    } = await supabase
      .from('weeks')
      .select('id')
      .eq(
        'season_id',
        currentWeek.season_id
      )
      .eq(
        'week_number',
        nextWeekNumber
      )
      .maybeSingle()

    if (
      existingNextWeekError
    ) {
      throw new Error(
        existingNextWeekError.message
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
    // NEXT WEEK WINDOW
    //
    // For now the next week starts when the current
    // week ends and runs exactly seven days.
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
    // CREATE NEXT WEEK
    // --------------------------------------------------

    const {
      data: nextWeek,
      error: nextWeekError,
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

    if (nextWeekError) {
      throw new Error(
        nextWeekError.message
      )
    }

    // --------------------------------------------------
    // CLOSE CURRENT WEEK
    // --------------------------------------------------

    const {
      error:
        closeWeekError,
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

    // If closing the old week fails, remove
    // the new week so we do not leave two active weeks.
    if (closeWeekError) {
      await supabase
        .from('weeks')
        .delete()
        .eq(
          'id',
          nextWeek.id
        )

      throw new Error(
        closeWeekError.message
      )
    }

    const nextFirstPicker =
      players.find(
        (player) =>
          player.id ===
          nextFirstPickerId
      )

    return NextResponse.json({
      success: true,

      message:
        `Week ${currentWeek.week_number} finalized by ${loggedInPlayer.name}. Week ${nextWeekNumber} is now active.`,

      finalizedBy: {
        id:
          loggedInPlayer.id,

        name:
          loggedInPlayer.name,
      },

      records,

      nextWeek: {
        id:
          nextWeek.id,

        weekNumber:
          nextWeek.week_number,

        startsAt:
          nextWeek.starts_at,

        endsAt:
          nextWeek.ends_at,

        firstPickerId:
          nextFirstPickerId,

        firstPickerName:
          nextFirstPicker?.name ??
          'Unknown',
      },
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
            : 'Unable to finalize week.',
      },
      { status: 500 }
    )
  }
}