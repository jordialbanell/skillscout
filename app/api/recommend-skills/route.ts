import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { skills } = await req.json()
    if (!Array.isArray(skills) || skills.length === 0) {
      return NextResponse.json({ success: false, error: 'skills[] required' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system: `You are a skill advisor for Claude users. Based on the available skills from a GitHub repository, recommend which ones are most worth installing. Be concise and practical. Return JSON only: { "recommended": ["skill-name", ...], "skip": ["skill-name", ...], "reasoning": { "skill-name": "one line reason" } }`,
      messages: [{
        role: 'user',
        content: `Available skills: ${skills.join(', ')}

The user's profile:
- Senior consultant at Hei by TOPPAN NEXT (Singapore), a B2B brand strategy and Marketing-as-a-Service consultancy
- Active clients: SIT (Singapore Institute of Technology), TD IP (TOPPAN Digital IP, conservative IP professionals), TDL (TOPPAN Digital Language), PlayPoint
- Daily work: writing client emails, LinkedIn content, proposals, campaign briefs, QBR decks
- Already installed: hei-brand-comms, frontend-design, pptx, docx, pdf, xlsx skills
- Side projects: Jordi-CRM (single HTML kanban), SkillScout (this app), Site Auditor (Next.js + Apify)
- Stack: Next.js 14, TypeScript, Tailwind, Supabase, Vercel, Claude API
- Does NOT need: SaaS conversion funnels, pricing pages, lead magnets, free trial CTAs, ecommerce

Recommend which skills to install and which to skip. Be specific about why each recommendation fits or doesn't fit this profile.`,
      }],
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
