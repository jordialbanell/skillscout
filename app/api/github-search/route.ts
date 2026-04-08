import { NextRequest, NextResponse } from 'next/server'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN

async function githubFetch(path: string) {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'SkillScout/1.0',
  }
  if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`
  const res = await fetch(`https://api.github.com/${path}`, { headers })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { searchTerms } = await req.json()
    if (!searchTerms?.length) return NextResponse.json({ results: [] })

    const seen = new Set<string>()
    const results = []

    for (const term of searchTerms.slice(0, 4)) {
      try {
        const data = await githubFetch(
          `search/repositories?q=${encodeURIComponent(term)}&sort=stars&order=desc&per_page=3`
        )
        for (const repo of data.items || []) {
          if (seen.has(repo.full_name)) continue
          seen.add(repo.full_name)

          // Check for skill files
          let skillFiles: string[] = []
          try {
            const contents = await githubFetch(`repos/${repo.full_name}/contents`)
            skillFiles = contents
              .filter((f: { name: string }) =>
                f.name.endsWith('.skill') || f.name === 'SKILL.md' ||
                f.name === 'skills' || f.name === 'skill'
              )
              .map((f: { name: string }) => f.name)
          } catch { /* ignore */ }

          // Trust score
          let trustScore = 0
          if (repo.stargazers_count >= 100) trustScore += 25
          else if (repo.stargazers_count >= 20) trustScore += 15
          else if (repo.stargazers_count >= 5) trustScore += 8

          const daysSince = (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24)
          if (daysSince < 30) trustScore += 20
          else if (daysSince < 180) trustScore += 12

          if (skillFiles.length > 0) trustScore += 30
          if (!repo.fork) trustScore += 10
          if (repo.description) trustScore += 5

          results.push({
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            lastUpdated: repo.pushed_at,
            language: repo.language,
            url: repo.html_url,
            skillFiles,
            trustScore: Math.min(100, trustScore),
            trustLevel: trustScore >= 60 ? 'high' : trustScore >= 35 ? 'medium' : 'low',
            matchedQuery: term,
          })
        }
      } catch { /* skip failed searches */ }
    }

    // Sort by trust score, take top 5
    results.sort((a, b) => b.trustScore - a.trustScore)
    return NextResponse.json({ results: results.slice(0, 5) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
