import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { author, caption, transcript, source } = await req.json()

    const content = [
      `Source: ${source}`,
      `Author: ${author}`,
      caption && `Caption: ${caption}`,
      transcript && `Transcript/Content: ${transcript}`,
    ].filter(Boolean).join('\n\n')

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system: `You are an expert at analyzing content about Claude AI skills and workflows. 
Extract structured information from video transcripts, captions, and articles about Claude skills.
Respond ONLY with a valid JSON object, no markdown, no preamble.`,
      messages: [{
        role: 'user',
        content: `Analyze this content and extract information about Claude skills being shared.

${content}

Return a JSON object with these fields:
{
  "skillName": "name of the skill or workflow being shared (string)",
  "skillDescription": "what this skill does, 1-2 sentences (string)",
  "skillCategory": "one of: marketing, coding, content, productivity, research, video, design, other",
  "githubUrls": ["array of any GitHub URLs explicitly mentioned"],
  "githubSearchTerms": ["array of 3-5 specific search queries to find relevant GitHub repos — e.g. 'claude code superpowers plugin', 'claude MEM memory plugin'. Be specific, use exact plugin/tool names mentioned."],
  "otherUrls": ["array of any other relevant URLs mentioned"],
  "keySteps": ["array of up to 5 key steps or techniques mentioned"],
  "claudeRelevance": "high | medium | low - how relevant this is to Claude skills specifically",
  "contentQuality": "high | medium | low - how clear and detailed the instructions are",
  "authorCredibility": "any signals of credibility: follower count mentioned, professional background, etc (string or null)",
  "isActuallyASkill": true/false - whether this is actually a downloadable .skill file or just general advice,
  "summary": "2-3 sentence summary of what is being shared"
}`
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    const analysis = JSON.parse(cleaned)

    return NextResponse.json({ success: true, analysis })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
