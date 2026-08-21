import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

export async function GET() {
  try {
    const supabase = createAdminClient()

    const {
      data: week,
      error: weekError,
    } = await supabase
      .from('weeks')
      .select('id, week_number')
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

    if (!week) {
      return NextResponse.json({
        success: true,
        weekId: null,
        pickCount: 0,
      })
    }

    const {
      count,
      error: picksError,
    } = await supabase
      .from('picks')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('week_id', week.id)

    if (picksError) {
      throw new Error(
        picksError.message
      )
    }

    return NextResponse.json({
      success: true,
      weekId: week.id,
      pickCount: count ?? 0,
    })
  } catch (error) {
    console.error(
      'GET /api/draft-state error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load draft state.',
      },
      { status: 500 }
    )
  }
}