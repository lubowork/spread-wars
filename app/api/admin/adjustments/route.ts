import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      weekId,
      targetPlayerId,
      requestedByPlayerId,
      winsDelta,
      lossesDelta,
      pushesDelta,
      reason,
    } = body

    if (
      !weekId ||
      !targetPlayerId ||
      !requestedByPlayerId ||
      !reason?.trim()
    ) {
      return NextResponse.json(
        { error: 'Missing required information.' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: adjustment, error } =
      await supabase
        .from('result_adjustments')
        .insert({
          week_id: weekId,
          target_player_id: targetPlayerId,
          requested_by_player_id:
            requestedByPlayerId,
          wins_delta: Number(winsDelta) || 0,
          losses_delta: Number(lossesDelta) || 0,
          pushes_delta: Number(pushesDelta) || 0,
          reason: reason.trim(),
          status: 'pending',
        })
        .select()
        .single()

    if (error) {
      throw new Error(error.message)
    }

    // Requester automatically votes YES.
    const { error: voteError } =
      await supabase
        .from('adjustment_votes')
        .insert({
          adjustment_id: adjustment.id,
          player_id: requestedByPlayerId,
          vote: 'yes',
        })

    if (voteError) {
      throw new Error(voteError.message)
    }

    return NextResponse.json({
      success: true,
      adjustment,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
      { status: 500 }
    )
  }
}