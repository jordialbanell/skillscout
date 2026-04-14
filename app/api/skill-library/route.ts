import { NextRequest, NextResponse } from 'next/server'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN

async function gh(path: string) {
  const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SkillScout/1.0' }
  if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`
  const res = await fetch(`https://api.github.com/${path}`, { headers })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { repoPath } = await req.json()
    if (!repoPath || !/^[\w.-]+\/[\w.-]+$/.test(repoPath)) {
      return NextResponse.json({ success: false, error: 'repoPath required' }, { status: 400 })
    }
    const repo = await gh(`repos/${repoPath}`)
    const branch = repo.default_branch || 'main'
    const treeData = await gh(`repos/${repoPath}/git/trees/${branch}?recursive=1`)
    const tree: { path: string; type: string }[] = (treeData.tree || []).filter((t: { path: string; type: string }) => t.path && t.type)

    const nested = tree.filter(t => t.type === 'blob' && /^skills\/[^/]+\/SKILL\.md$/i.test(t.path))
    const rootLevel = tree.filter(t => t.type === 'blob' && /^[^/]+\/SKILL\.md$/i.test(t.path))
    const pattern = nested.length >= 2 ? nested : (rootLevel.length >= 2 ? rootLevel : null)
    if (!pattern) return NextResponse.json({ success: true, library: null })

    const seen = new Set<string>()
    const skills: { name: string; prefix: string }[] = []
    for (const p of pattern) {
      const parts = p.path.split('/')
      const name = parts[parts.length - 2]
      const prefix = parts.slice(0, -1).join('/') + '/'
      if (seen.has(name)) continue
      seen.add(name)
      skills.push({ name, prefix })
    }
    skills.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ success: true, library: { skills, tree, defaultBranch: branch } })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
