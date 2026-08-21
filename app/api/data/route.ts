import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-admin'

export async function GET() {
  try {
    const supabase = createAdminClient()

    // Get players
    const {
      data: players,
      error: playersError,
    } = await supabase
      .from('players')
      .select('id, name')
      .order('name')

    if (playersError) {
      throw new Error(playersError.message)
    }

    // Get active week
    const {
      data: week,
      error: weekError,
    } = await supabase
      .from('weeks')
      .select('id, week_number, status')
      .eq('status', 'active')
      .order('week_number', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle()

    if (weekError) {
      throw new Error(weekError.message)
    }

    // If there is no active week,
    // return players and an empty adjustment list.
    if (!week) {
      return NextResponse.json({
        success: true,
        players: players ?? [],
        week: null,
        adjustments: [],
      })
    }

    // Get adjustments
    const {
      data: adjustments,
      error: adjustmentsError,
    } = await supabase
      .from('result_adjustments')
      .select(`
        id,
        target_player_id,
        requested_by_player_id,
        wins_delta,
        losses_delta,
        pushes_delta,
        reason,
        status,
        created_at
      `)
      .eq('week_id', week.id)
      .order('created_at', {
        ascending: false,
      })

    if (adjustmentsError) {
      throw new Error(
        adjustmentsError.message
      )
    }

    // Get all adjustment IDs
    const adjustmentIds = (
      adjustments ?? []
    ).map(
      (adjustment) => adjustment.id
    )

    let votes: {
      adjustment_id: string
      player_id: string
      vote: string
    }[] = []

    // Only query votes if adjustments exist
    if (adjustmentIds.length > 0) {
      const {
        data: voteData,
        error: voteError,
      } = await supabase
        .from('adjustment_votes')
        .select(`
          adjustment_id,
          player_id,
          vote
        `)
        .in(
          'adjustment_id',
          adjustmentIds
        )

      if (voteError) {
        throw new Error(
          voteError.message
        )
      }

      votes = voteData ?? []
    }

    // Attach votes to each adjustment
    const adjustmentsWithVotes = (
      adjustments ?? []
    ).map(
      (adjustment) => ({
        ...adjustment,

        adjustment_votes:
          votes.filter(
            (vote) =>
              vote.adjustment_id ===
              adjustment.id
          ),
      })
    )

    return NextResponse.json({
      success: true,
      players: players ?? [],
      week,
      adjustments:
        adjustmentsWithVotes,
    })
  } catch (error) {
    console.error(
      'GET /api/admin/data error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
      {
        status: 500,
      }
    )
  }
}