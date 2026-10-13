import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

type Confidence =
  | 'low'
  | 'medium'
  | 'high'

type AnalysisResult = {
  recommended_team: string
  confidence: Confidence
  rationale: string
}

type Source = {
  title: string
  url: string
}

async function getLoggedInPlayer() {
  const authSupabase =
    await createClient()

  const {
    data: { user },
    error: userError,
  } =
    await authSupabase.auth.getUser()

  if (
    userError ||
    !user
  ) {
    return {
      player: null,
      error:
        'Not authenticated.',
    }
  }

  const supabase =
    createAdminClient()

  const {
    data: player,
    error: playerError,
  } = await supabase
    .from('players')
    .select(
      'id, name, ai_analysis_enabled'
    )
    .eq(
      'auth_user_id',
      user.id
    )
    .maybeSingle()

  if (
    playerError ||
    !player
  ) {
    return {
      player: null,
      error:
        'Your login is not linked to a Spread Wars player.',
    }
  }

  return {
    player,
    error: null,
  }
}

async function getActiveWeek() {
  const supabase =
    createAdminClient()

  const {
    data: week,
    error,
  } = await supabase
    .from('weeks')
    .select(
      'id, week_number, starts_at, ends_at'
    )
    .eq(
      'status',
      'active'
    )
    .order(
      'created_at',
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(
      error.message
    )
  }

  return week
}

function getOutputText(
  responseData: any
) {
  for (
    const item of
    responseData?.output ?? []
  ) {
    if (
      item?.type !==
        'message' ||
      !Array.isArray(
        item.content
      )
    ) {
      continue
    }

    for (
      const content of
      item.content
    ) {
      if (
        content?.type ===
          'output_text' &&
        typeof content.text ===
          'string'
      ) {
        return content.text
      }
    }
  }

  return ''
}

function getSources(
  responseData: any
) {
  const found =
    new Map<
      string,
      Source
    >()

  function addSource(
    title: unknown,
    url: unknown
  ) {
    if (
      typeof url !==
        'string' ||
      !url.startsWith(
        'http'
      )
    ) {
      return
    }

    found.set(
      url,
      {
        title:
          typeof title ===
            'string' &&
          title.trim()
            ? title.trim()
            : url,
        url,
      }
    )
  }

  for (
    const item of
    responseData?.output ?? []
  ) {
    const actionSources =
      item?.action?.sources

    if (
      Array.isArray(
        actionSources
      )
    ) {
      for (
        const source of
        actionSources
      ) {
        addSource(
          source?.title,
          source?.url
        )
      }
    }

    if (
      item?.type ===
        'message' &&
      Array.isArray(
        item.content
      )
    ) {
      for (
        const content of
        item.content
      ) {
        for (
          const annotation of
          content?.annotations ??
          []
        ) {
          if (
            annotation?.type ===
            'url_citation'
          ) {
            addSource(
              annotation?.title,
              annotation?.url
            )
          }
        }
      }
    }
  }

  return Array.from(
    found.values()
  ).slice(
    0,
    8
  )
}

export async function GET() {
  try {
    const {
      player,
      error:
        authorizationError,
    } =
      await getLoggedInPlayer()

    if (
      authorizationError ||
      !player
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            authorizationError,
        },
        {
          status: 401,
        }
      )
    }

    const week =
      await getActiveWeek()

    if (!week) {
      return NextResponse.json({
        success: true,
        playerEnabled:
          player.ai_analysis_enabled ??
          false,
        week: null,
        games: [],
        analyzedCount: 0,
      })
    }

    if (
      !week.starts_at ||
      !week.ends_at
    ) {
      return NextResponse.json({
        success: true,
        playerEnabled:
          player.ai_analysis_enabled ??
          false,
        week,
        games: [],
        analyzedCount: 0,
      })
    }

    const supabase =
      createAdminClient()

    const {
      data: games,
      error: gamesError,
    } = await supabase
      .from('games')
      .select(
        'id, home_team, away_team, start_time, completed'
      )
      .gte(
        'start_time',
        week.starts_at
      )
      .lt(
        'start_time',
        week.ends_at
      )
      .eq(
        'completed',
        false
      )
      .gt(
        'start_time',
        new Date()
          .toISOString()
      )
      .order(
        'start_time',
        {
          ascending: true,
        }
      )

    if (gamesError) {
      throw new Error(
        gamesError.message
      )
    }

    const gameIds =
      (games ?? []).map(
        (game) =>
          game.id
      )

    let analyzedGameIds:
      string[] = []

    if (
      gameIds.length > 0
    ) {
      const {
        data:
          analysisRows,
        error:
          analysisError,
      } = await supabase
        .from(
          'ai_game_analysis'
        )
        .select(
          'game_id'
        )
        .eq(
          'week_id',
          week.id
        )
        .in(
          'game_id',
          gameIds
        )

      if (
        analysisError
      ) {
        throw new Error(
          analysisError.message
        )
      }

      analyzedGameIds =
        (
          analysisRows ??
          []
        ).map(
          (row) =>
            row.game_id
        )
    }

    return NextResponse.json({
      success: true,
      playerEnabled:
        player.ai_analysis_enabled ??
        false,
      week: {
        id:
          week.id,
        week_number:
          week.week_number,
      },
      games:
        games ?? [],
      analyzedCount:
        analyzedGameIds.length,
      analyzedGameIds,
    })
  } catch (error) {
    console.error(
      'GET /api/admin/ai-analysis error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load AI Analysis.',
      },
      {
        status: 500,
      }
    )
  }
}

export async function POST(
  request: Request
) {
  try {
    const {
      player,
      error:
        authorizationError,
    } =
      await getLoggedInPlayer()

    if (
      authorizationError ||
      !player
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            authorizationError,
        },
        {
          status: 401,
        }
      )
    }

    const body =
      await request.json()

    const action =
      body?.action

    const supabase =
      createAdminClient()

    if (
      action ===
      'set-enabled'
    ) {
      const enabled =
        Boolean(
          body?.enabled
        )

      const {
        error: updateError,
      } = await supabase
        .from('players')
        .update({
          ai_analysis_enabled:
            enabled,
        })
        .eq(
          'id',
          player.id
        )

      if (updateError) {
        throw new Error(
          updateError.message
        )
      }

      return NextResponse.json({
        success: true,
        enabled,
        message:
          enabled
            ? 'AI Analysis is now visible on your Draft Board.'
            : 'AI Analysis is now hidden on your Draft Board.',
      })
    }

    if (
      action !==
      'analyze-game'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Unknown AI Analysis action.',
        },
        {
          status: 400,
        }
      )
    }

    const week =
      await getActiveWeek()

    if (!week) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No active week was found.',
        },
        {
          status: 404,
        }
      )
    }

    if (
      !week.starts_at ||
      !week.ends_at
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The active week does not have a complete game window.',
        },
        {
          status: 400,
        }
      )
    }

    const gameId =
      typeof body?.gameId ===
      'string'
        ? body.gameId
        : ''

    if (!gameId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'gameId is required.',
        },
        {
          status: 400,
        }
      )
    }

    const {
      data: game,
      error: gameError,
    } = await supabase
      .from('games')
      .select(
        'id, home_team, away_team, start_time, completed'
      )
      .eq(
        'id',
        gameId
      )
      .maybeSingle()

    if (gameError) {
      throw new Error(
        gameError.message
      )
    }

    if (!game) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Game not found.',
        },
        {
          status: 404,
        }
      )
    }

    const gameTime =
      new Date(
        game.start_time
      ).getTime()

    if (
      game.completed ||
      gameTime <=
        Date.now()
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message:
          'Game has already started or finished.',
      })
    }

    const weekStart =
      new Date(
        week.starts_at
      ).getTime()

    const weekEnd =
      new Date(
        week.ends_at
      ).getTime()

    if (
      gameTime <
        weekStart ||
      gameTime >=
        weekEnd
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Game is outside the active week.',
        },
        {
          status: 400,
        }
      )
    }

    const {
      data: oddsRows,
      error: oddsError,
    } = await supabase
      .from('odds')
      .select(
        'team, spread, fetched_at'
      )
      .eq(
        'game_id',
        game.id
      )
      .eq(
        'sportsbook',
        'DraftKings'
      )
      .eq(
        'market',
        'spreads'
      )
      .order(
        'fetched_at',
        {
          ascending: false,
        }
      )

    if (oddsError) {
      throw new Error(
        oddsError.message
      )
    }

    const latest =
      new Map<
        string,
        number
      >()

    for (
      const odd of
      oddsRows ?? []
    ) {
      if (
        !latest.has(
          odd.team
        )
      ) {
        latest.set(
          odd.team,
          Number(
            odd.spread
          )
        )
      }
    }

    const awaySpread =
      latest.get(
        game.away_team
      )

    const homeSpread =
      latest.get(
        game.home_team
      )

    if (
      awaySpread ===
        undefined ||
      homeSpread ===
        undefined
    ) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message:
          'DraftKings spread is not available for both teams.',
      })
    }

    const apiKey =
      process.env
        .OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'OPENAI_API_KEY is not configured.',
        },
        {
          status: 500,
        }
      )
    }

    const model =
      process.env
        .OPENAI_AI_ANALYSIS_MODEL ||
      'gpt-6-sol'

    const prompt =
      `Research this college football matchup and recommend the side more likely to COVER the exact DraftKings spread.

Away: ${game.away_team} ${awaySpread > 0 ? '+' : ''}${awaySpread}
Home: ${game.home_team} ${homeSpread > 0 ? '+' : ''}${homeSpread}
Kickoff: ${game.start_time}

Use current web research. Weigh expert and pundit picks, injuries and quarterback status, recent form, opponent quality, efficiency and matchup data, home/road context, and market consensus when reliable information is available.

Return one ATS recommendation, not merely the straight-up winner.

Confidence rules:
high = strong agreement across credible evidence with a meaningful ATS edge.
medium = useful lean with solid support but meaningful uncertainty.
low = thin edge, conflicting evidence, or limited current information.

recommended_team must exactly equal either "${game.away_team}" or "${game.home_team}".
Keep rationale to 2-4 specific sentences. Do not invent injuries, statistics, or expert opinions.`

    const response =
      await fetch(
        'https://api.openai.com/v1/responses',
        {
          method:
            'POST',
          headers: {
            Authorization:
              `Bearer ${apiKey}`,
            'Content-Type':
              'application/json',
          },
          body:
            JSON.stringify({
              model,
              reasoning: {
                effort:
                  'medium',
              },
              tools: [
                {
                  type:
                    'web_search',
                  search_context_size:
                    'medium',
                },
              ],
              tool_choice:
                'required',
              max_tool_calls:
                5,
              include: [
                'web_search_call.action.sources',
              ],
              store:
                false,
              input:
                prompt,
              text: {
                format: {
                  type:
                    'json_schema',
                  name:
                    'spread_wars_ai_pick',
                  strict:
                    true,
                  schema: {
                    type:
                      'object',
                    properties: {
                      recommended_team: {
                        type:
                          'string',
                      },
                      confidence: {
                        type:
                          'string',
                        enum: [
                          'low',
                          'medium',
                          'high',
                        ],
                      },
                      rationale: {
                        type:
                          'string',
                      },
                    },
                    required: [
                      'recommended_team',
                      'confidence',
                      'rationale',
                    ],
                    additionalProperties:
                      false,
                  },
                },
              },
            }),
        }
      )

    const responseData =
      await response.json()

    if (!response.ok) {
      throw new Error(
        responseData?.error
          ?.message ||
          'OpenAI analysis request failed.'
      )
    }

    const outputText =
      getOutputText(
        responseData
      )

    if (!outputText) {
      throw new Error(
        'AI analysis returned no result.'
      )
    }

    let analysis:
      AnalysisResult

    try {
      analysis =
        JSON.parse(
          outputText
        ) as AnalysisResult
    } catch {
      throw new Error(
        'AI analysis returned an unexpected format.'
      )
    }

    if (
      analysis
        .recommended_team !==
        game.away_team &&
      analysis
        .recommended_team !==
        game.home_team
    ) {
      throw new Error(
        'AI analysis recommended a team that is not in the game.'
      )
    }

    if (
      ![
        'low',
        'medium',
        'high',
      ].includes(
        analysis.confidence
      )
    ) {
      throw new Error(
        'AI analysis returned an invalid confidence level.'
      )
    }

    const analyzedSpread =
      analysis
        .recommended_team ===
      game.away_team
        ? awaySpread
        : homeSpread

    const sources =
      getSources(
        responseData
      )

    const analyzedAt =
      new Date()
        .toISOString()

    const {
      error: saveError,
    } = await supabase
      .from(
        'ai_game_analysis'
      )
      .upsert(
        {
          week_id:
            week.id,
          game_id:
            game.id,
          recommended_team:
            analysis
              .recommended_team,
          confidence:
            analysis.confidence,
          analyzed_spread:
            analyzedSpread,
          rationale:
            analysis.rationale,
          sources,
          analyzed_at:
            analyzedAt,
          model,
        },
        {
          onConflict:
            'week_id,game_id',
        }
      )

    if (saveError) {
      throw new Error(
        saveError.message
      )
    }

    return NextResponse.json({
      success: true,
      skipped: false,
      gameId:
        game.id,
      recommendedTeam:
        analysis
          .recommended_team,
      confidence:
        analysis.confidence,
      analyzedSpread,
      rationale:
        analysis.rationale,
      sources,
      analyzedAt,
    })
  } catch (error) {
    console.error(
      'POST /api/admin/ai-analysis error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to run AI Analysis.',
      },
      {
        status: 500,
      }
    )
  }
}
