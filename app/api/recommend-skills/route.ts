import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import profile from '../../../user-profile.json'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { skills } = await req.json()
    if (!Array.isArray(skills) || skills.length === 0) {
      return NextResponse.json({ success: false, error: 'skills[] required' }, { status: 400 })
    }

    const userContext = `
Role: ${profile.role}

Active projects:
${profile.active_projects.map(p => `- ${p}`).join('\n')}

Already installed skills (do not recommend these):
${profile.installed_skills.map(s => `- ${s}`).join('\n')}

Dev projects and stack:
${profile.dev_projects.map(p => `- ${p}`).join('\n')}
Stack: ${profile.dev_stack.join(', ')}

Growth ambitions (skills supporting these are high value):
${profile.growth_ambitions.map(a => `- ${a}`).join('\n')}

Not relevant (skip these categories):
${profile.not_relevant.map(n => `- ${n}`).join('\n')}
`.trim()

    const userPrompt = `Available skills: ${skills.join(', ')}

${userContext}

Categorise each skill into exactly one of these four buckets:
- "use_now": directly useful for current client work or dev projects today
- "sell_next": could become a new Hei service line or meaningfully expand what Hei offers
- "productivity": speeds up personal workflow or dev work
- "skip": not applicable given the profile above

Return JSON only:
{
  "use_now": ["skill-name", ...],
  "sell_next": ["skill-name", ...],
  "productivity": ["skill-name", ...],
  "skip": ["skill-name", ...],
  "reasoning": { "skill-name": "one line reason tied to a specific project or ambition" }
}`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      system: `You are a skill advisor for Claude users. Categorise each available skill based on the user's real profile. Be concise and practical. Every reasoning line must reference a specific project, client, or ambition from the profile. Return JSON only matching the schema in the user prompt.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ success: false, error: 'no JSON in response' }, { status: 500 })
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({ success: true, ...parsed })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
