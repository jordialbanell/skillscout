import { NextRequest, NextResponse } from 'next/server'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN

function extractRepoPath(url: string): string | null {
  const match = url.match(/github\.com\/([^/]+\/[^/\s?#]+)/)
  return match ? match[1].replace(/\.git$/, '') : null
}

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
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

    const repoPath = extractRepoPath(url)
    if (!repoPath) return NextResponse.json({ error: 'Could not parse GitHub URL' }, { status: 400 })

    // Fetch repo info
    const repo = await githubFetch(`repos/${repoPath}`)

    // Fetch top-level contents
    let contents: { name: string; type: string; path: string }[] = []
    try {
      contents = await githubFetch(`repos/${repoPath}/contents`)
    } catch { /* ignore */ }

    // Check for skill files (.skill, SKILL.md, skills/ folder)
    const hasSkillFile = contents.some(f =>
      f.name.endsWith('.skill') ||
      f.name === 'SKILL.md' ||
      f.name === 'skills' ||
      f.name === 'skill'
    )

    const hasReadme = contents.some(f => f.name.toLowerCase().startsWith('readme'))

    // Check skills subfolder if present
    let skillFiles: string[] = []
    const skillsFolder = contents.find(f => f.type === 'dir' && (f.name === 'skills' || f.name === 'skill'))
    if (skillsFolder) {
      try {
        const skillContents = await githubFetch(`repos/${repoPath}/contents/${skillsFolder.path}`)
        skillFiles = skillContents
          .filter((f: { name: string }) => f.name.endsWith('.skill') || f.name === 'SKILL.md')
          .map((f: { name: string; path: string }) => f.path)
      } catch { /* ignore */ }
    }

    // Also check root for .skill files
    const rootSkillFiles = contents
      .filter(f => f.name.endsWith('.skill') || f.name === 'SKILL.md')
      .map(f => f.path)

    const allSkillFiles = Array.from(new Set([...skillFiles, ...rootSkillFiles]))

    // Try to fetch README for additional context
    let readmeContent = ''
    if (hasReadme) {
      try {
        const readmeFile = contents.find(f => f.name.toLowerCase().startsWith('readme'))
        if (readmeFile) {
          const readmeData = await githubFetch(`repos/${repoPath}/contents/${readmeFile.path}`)
          if (readmeData.content) {
            readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8').slice(0, 2000)
          }
        }
      } catch { /* ignore */ }
    }

    // Calculate trust score
    let trustScore = 0
    const signals: { label: string; positive: boolean }[] = []

    // Stars
    if (repo.stargazers_count >= 100) { trustScore += 25; signals.push({ label: `${repo.stargazers_count} stars`, positive: true }) }
    else if (repo.stargazers_count >= 20) { trustScore += 15; signals.push({ label: `${repo.stargazers_count} stars`, positive: true }) }
    else if (repo.stargazers_count >= 5) { trustScore += 8; signals.push({ label: `${repo.stargazers_count} stars`, positive: true }) }
    else { signals.push({ label: `${repo.stargazers_count} stars (low)`, positive: false }) }

    // Recency
    const lastPush = new Date(repo.pushed_at)
    const daysSince = (Date.now() - lastPush.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 30) { trustScore += 20; signals.push({ label: 'Updated recently', positive: true }) }
    else if (daysSince < 180) { trustScore += 12; signals.push({ label: 'Updated within 6 months', positive: true }) }
    else { signals.push({ label: `Last updated ${Math.round(daysSince / 30)} months ago`, positive: false }) }

    // Has skill files
    if (allSkillFiles.length > 0) { trustScore += 30; signals.push({ label: `${allSkillFiles.length} skill file(s) found`, positive: true }) }
    else if (hasSkillFile) { trustScore += 20; signals.push({ label: 'Skill structure detected', positive: true }) }
    else { signals.push({ label: 'No .skill files found', positive: false }) }

    // Has README
    if (hasReadme) { trustScore += 10; signals.push({ label: 'Has README', positive: true }) }

    // Not a fork
    if (!repo.fork) { trustScore += 10; signals.push({ label: 'Original repo (not a fork)', positive: true }) }
    else { signals.push({ label: 'Forked repo', positive: false }) }

    // Has description
    if (repo.description) { trustScore += 5; signals.push({ label: 'Has description', positive: true }) }

    const trustLevel = trustScore >= 60 ? 'high' : trustScore >= 35 ? 'medium' : 'low'

    return NextResponse.json({
      success: true,
      github: {
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        lastUpdated: repo.pushed_at,
        language: repo.language,
        isForked: repo.fork,
        url: repo.html_url,
        readmeContent,
        skillFiles: allSkillFiles,
        trustScore: Math.min(100, trustScore),
        trustLevel,
        signals,
      }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
