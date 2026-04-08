import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { newScan, existingScans } = await req.json()
    if (!existingScans?.length) return NextResponse.json({ similar: [] })

    const existingSummary = existingScans.map((s: {skill_name: string; category: string; summary: string; github_repos: {fullName: string; trustScore: number}[]}, i: number) => 
      `[${i}] "${s.skill_name}" (${s.category}) — ${s.summary?.slice(0, 150)} | repos: ${s.github_repos?.map((r: {fullName: string}) => r.fullName).join(', ')}`
    ).join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: 'You compare Claude skills and detect similarities. Respond ONLY with valid JSON, no markdown.',
      messages: [{
        role: 'user',
        content: `New skill being scanned:
Name: "${newScan.skillName}"
Category: ${newScan.skillCategory}
Summary: ${newScan.summary}
Repos: ${newScan.githubUrls?.join(', ') || 'none found'}

Existing skills in history:
${existingSummary}

For each existing skill that is similar to the new one, return a JSON array of objects. Only include genuinely similar ones (same category + overlapping purpose).

[{
  "index": 0,
  "existingName": "name of existing skill",
  "similarityLevel": "high | medium",
  "reason": "one sentence why they overlap",
  "recommendation": "one of: keep_new | keep_existing | merge | keep_both",
  "recommendationReason": "one sentence explaining the recommendation"
}]

If nothing is similar, return an empty array: []`
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
    const cleaned = text.replace(/```json|```/g, '').trim()
    const similar = JSON.parse(cleaned)
    return NextResponse.json({ similar })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message, similar: [] }, { status: 500 })
  }
}
