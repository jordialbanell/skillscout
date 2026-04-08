'use client'

import { useState } from 'react'

type Stage = 'idle' | 'extracting' | 'analyzing' | 'github' | 'done' | 'error'
type TrustLevel = 'high' | 'medium' | 'low'

interface ExtractedData {
  author: string
  caption: string
  transcript: string | null
  thumbnail: string | null
  source: string
}

interface Analysis {
  skillName: string
  skillDescription: string
  skillCategory: string
  githubUrls: string[]
  githubSearchTerms: string[]
  otherUrls: string[]
  keySteps: string[]
  claudeRelevance: string
  contentQuality: string
  authorCredibility: string | null
  isActuallyASkill: boolean
  summary: string
}

interface GithubRepo {
  name: string
  fullName: string
  description: string
  stars: number
  forks: number
  lastUpdated: string
  language: string
  isForked?: boolean
  url: string
  skillFiles: string[]
  trustScore: number
  trustLevel: TrustLevel
  signals?: { label: string; positive: boolean }[]
  matchedQuery?: string
}

const CATEGORY_ICONS: Record<string, string> = {
  marketing: '📣', coding: '💻', content: '✍️',
  productivity: '⚡', research: '🔍', video: '🎬', design: '🎨', other: '🧩',
}

const SOURCE_LABELS: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', article: 'Article',
}

const STAGE_LABELS: Record<string, string> = {
  extracting: 'Fetching content…',
  analyzing: 'Analysing with Claude…',
  github: 'Searching GitHub for skills…',
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [extracted, setExtracted] = useState<ExtractedData | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [githubResults, setGithubResults] = useState<GithubRepo[]>([])

  const reset = () => {
    setStage('idle'); setError(''); setExtracted(null)
    setAnalysis(null); setGithubResults([])
  }

  const run = async () => {
    if (!url.trim()) return
    reset()

    try {
      // Step 1: Extract content
      setStage('extracting')
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const extractData = await extractRes.json()
      if (!extractData.success) throw new Error(extractData.error || 'Extraction failed')
      setExtracted(extractData.data)

      // Step 2: Analyse with Claude
      setStage('analyzing')
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extractData.data),
      })
      const analyzeData = await analyzeRes.json()
      if (!analyzeData.success) throw new Error(analyzeData.error || 'Analysis failed')
      const an: Analysis = analyzeData.analysis
      setAnalysis(an)

      // Step 3: GitHub — explicit URLs first, then search
      setStage('github')
      const ghResults: GithubRepo[] = []

      // Check explicit URLs
      for (const ghUrl of (an.githubUrls || []).slice(0, 3)) {
        try {
          const ghRes = await fetch('/api/github', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: ghUrl }),
          })
          const ghData = await ghRes.json()
          if (ghData.success) ghResults.push(ghData.github)
        } catch { /* ignore */ }
      }

      // If no explicit repos found, search GitHub
      if (ghResults.length === 0 && an.githubSearchTerms?.length > 0) {
        try {
          const searchRes = await fetch('/api/github-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchTerms: an.githubSearchTerms }),
          })
          const searchData = await searchRes.json()
          if (searchData.results?.length) {
            ghResults.push(...searchData.results)
          }
        } catch { /* ignore */ }
      }

      setGithubResults(ghResults)
      setStage('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStage('error')
    }
  }

  const downloadSkillFile = (gh: GithubRepo, an: Analysis) => {
    const skillContent = `---
name: ${an.skillName.toLowerCase().replace(/\s+/g, '-')}
description: ${an.skillDescription} Use this skill when working on ${an.skillCategory} tasks with Claude.
---

# ${an.skillName}

${an.summary}

## Source
- Original content: ${url}
- GitHub: ${gh.url}

## Key Steps
${an.keySteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Notes
- Category: ${an.skillCategory}
- Content quality: ${an.contentQuality}
- GitHub trust score: ${gh.trustScore}/100
`
    const blob = new Blob([skillContent], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${an.skillName.toLowerCase().replace(/\s+/g, '-')}.skill`
    a.click()
  }

  const isLoading = ['extracting', 'analyzing', 'github'].includes(stage)
  const hasExplicitRepos = analysis && analysis.githubUrls?.length > 0
  const hasSearchResults = githubResults.length > 0 && !hasExplicitRepos

  return (
    <main className="main">

      {/* Nav */}
      <nav className="nav">
        <span className="nav-logo">SkillScout</span>
        <span className="nav-tagline">Claude skill discovery</span>
      </nav>

      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title">
          Find the skill<br />
          <em>behind the video.</em>
        </h1>
        <p className="hero-sub">
          Paste an Instagram reel, TikTok, or article. We extract the Claude skill,
          search GitHub for matching repos, and give you a file ready to install.
        </p>
      </section>

      {/* Input */}
      <section className="input-section">
        <div className={`input-box ${isLoading ? 'loading' : ''}`}>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !isLoading && run()}
            placeholder="instagram.com/reel/…  or  tiktok.com/@…  or  any article URL"
            className="url-input"
            disabled={isLoading}
          />
          <button onClick={run} disabled={isLoading || !url.trim()} className="scan-btn">
            {isLoading ? <span className="spinner" /> : 'Scan'}
          </button>
        </div>
        {isLoading && (
          <div className="stage-status animate-fade-in">
            <span className="stage-dot-pulse" />
            {STAGE_LABELS[stage]}
          </div>
        )}
      </section>

      {/* Error */}
      {stage === 'error' && (
        <section className="error-section animate-fade-up">
          <div className="error-box">
            <div className="error-title">Could not process this URL</div>
            <div className="error-msg">{error}</div>
            <button onClick={reset} className="link-btn">Try again →</button>
          </div>
        </section>
      )}

      {/* Results */}
      {stage === 'done' && analysis && (
        <section className="results animate-fade-up">

          <div className="results-divider"><span>Result</span></div>

          {/* Skill summary */}
          <article className="skill-card">
            <header className="skill-card-header">
              <div className="skill-pills">
                <span className="pill">
                  {CATEGORY_ICONS[analysis.skillCategory]} {analysis.skillCategory}
                </span>
                {extracted && <span className="pill">{SOURCE_LABELS[extracted.source]}</span>}
                <span className={`pill quality-${analysis.contentQuality}`}>{analysis.contentQuality} quality</span>
                <span className={`pill relevance-${analysis.claudeRelevance}`}>{analysis.claudeRelevance} relevance</span>
              </div>
            </header>

            <h2 className="skill-name">{analysis.skillName}</h2>
            <p className="skill-summary">{analysis.summary}</p>

            {analysis.keySteps.length > 0 && (
              <div className="key-steps">
                <p className="steps-label">Key steps</p>
                <ol className="steps-list">
                  {analysis.keySteps.map((step, i) => (
                    <li key={i} className="step-item">
                      <span className="step-num">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {extracted?.author && (
              <footer className="skill-footer">
                <span className="author-by">by</span>
                <span className="author-name">@{extracted.author}</span>
                {analysis.authorCredibility && (
                  <span className="author-cred">· {analysis.authorCredibility}</span>
                )}
              </footer>
            )}
          </article>

          {/* GitHub results */}
          {githubResults.length > 0 && (
            <div className="github-section">
              <p className="section-label">
                {hasSearchResults
                  ? `GitHub repos found for "${analysis.skillName}"`
                  : 'GitHub'}
              </p>
              {hasSearchResults && (
                <p className="search-note">
                  No repo was linked in the video — these are the closest matches found on GitHub.
                </p>
              )}

              {githubResults.map((gh, i) => (
                <div key={i} className="github-card">
                  <div className="github-top">
                    <div className="github-info">
                      <a href={gh.url} target="_blank" rel="noopener noreferrer" className="repo-name">
                        {gh.fullName}
                      </a>
                      {gh.matchedQuery && (
                        <span className="matched-query">matched: {gh.matchedQuery}</span>
                      )}
                      {gh.description && <p className="repo-desc">{gh.description}</p>}
                      <div className="repo-meta">
                        <span>★ {gh.stars}</span>
                        <span>⑂ {gh.forks}</span>
                        {gh.language && <span>{gh.language}</span>}
                        <span>{new Date(gh.lastUpdated).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                    <div className={`trust-badge trust-${gh.trustLevel}`}>
                      <span className="trust-score">{gh.trustScore}</span>
                      <span className="trust-label">{gh.trustLevel}</span>
                    </div>
                  </div>

                  {gh.skillFiles && gh.skillFiles.length > 0 && (
                    <div className="skill-files">
                      <p className="skill-files-label">Skill files found</p>
                      {gh.skillFiles.map((f, j) => (
                        <div key={j} className="skill-file">◈ {f}</div>
                      ))}
                    </div>
                  )}

                  <div className="github-actions">
                    <a href={gh.url} target="_blank" rel="noopener noreferrer" className="link-btn">
                      View on GitHub →
                    </a>
                    <button onClick={() => downloadSkillFile(gh, analysis)} className="download-btn">
                      Download .skill file ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Truly nothing found */}
          {githubResults.length === 0 && (
            <div className="no-github">
              <p className="no-github-title">No matching repos found</p>
              <p className="no-github-sub">
                This content shares techniques but we could not find a matching GitHub repo.
                You can still generate a skill file from the extracted steps.
              </p>
              <button onClick={() => downloadSkillFile(
                { url, fullName: 'manual', trustScore: 0, trustLevel: 'low', skillFiles: [], description: '', stars: 0, forks: 0, lastUpdated: '', language: '', name: '' },
                analysis
              )} className="download-btn">
                Generate skill file anyway ↓
              </button>
            </div>
          )}

          <button onClick={reset} className="new-scan">← Scan another URL</button>
        </section>
      )}

      <style jsx>{`
        .main { max-width: 680px; margin: 0 auto; padding: 0 28px 120px; }

        .nav {
          display: flex; align-items: baseline; justify-content: space-between;
          padding: 36px 0 20px; border-bottom: 1px solid var(--border);
        }
        .nav-logo { font-family: var(--font-display); font-size: 20px; font-weight: 600; letter-spacing: -0.3px; }
        .nav-tagline { font-size: 12px; color: var(--text-dim); letter-spacing: 0.04em; text-transform: uppercase; }

        .hero { padding: 72px 0 56px; border-bottom: 1px solid var(--border); margin-bottom: 56px; }
        .hero-title {
          font-family: var(--font-display);
          font-size: clamp(42px, 7vw, 64px);
          font-weight: 500; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 20px;
        }
        .hero-title em { font-style: italic; color: var(--text-muted); }
        .hero-sub { font-size: 16px; line-height: 1.7; color: var(--text-muted); max-width: 480px; font-weight: 300; }

        .input-section { margin-bottom: 64px; }
        .input-box {
          display: flex; border: 1px solid var(--border-dark); border-radius: 3px;
          background: var(--bg-2); transition: border-color 0.2s, box-shadow 0.2s; overflow: hidden;
        }
        .input-box:focus-within { border-color: var(--text); box-shadow: 0 0 0 3px rgba(26,25,21,0.06); }
        .input-box.loading { opacity: 0.7; }
        .url-input {
          flex: 1; border: none; outline: none; padding: 16px 18px;
          font-family: var(--font-body); font-size: 14px; font-weight: 300;
          color: var(--text); background: transparent; min-width: 0;
        }
        .url-input::placeholder { color: var(--text-dim); }
        .scan-btn {
          background: var(--text); color: white; border: none; padding: 0 24px;
          font-family: var(--font-body); font-size: 13px; font-weight: 500;
          letter-spacing: 0.04em; cursor: pointer; transition: opacity 0.15s;
          min-width: 80px; display: flex; align-items: center; justify-content: center;
        }
        .scan-btn:hover:not(:disabled) { opacity: 0.8; }
        .scan-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .stage-status {
          display: flex; align-items: center; gap: 10px; margin-top: 14px;
          font-size: 13px; color: var(--text-muted); font-weight: 300;
        }
        .stage-dot-pulse {
          width: 6px; height: 6px; border-radius: 50%; background: var(--accent-2);
          animation: pulse 1.4s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }

        .error-section { margin-bottom: 40px; }
        .error-box { padding: 24px; border: 1px solid var(--red-border); border-radius: 3px; background: var(--red-bg); }
        .error-title { font-weight: 500; color: var(--red); margin-bottom: 6px; font-size: 14px; }
        .error-msg { font-size: 13px; color: var(--text-muted); margin-bottom: 14px; font-weight: 300; }

        .link-btn {
          background: none; border: none; padding: 0; font-family: var(--font-body);
          font-size: 13px; color: var(--text); cursor: pointer;
          text-decoration: underline; text-underline-offset: 3px;
        }
        .link-btn:hover { color: var(--text-muted); }

        .results { display: flex; flex-direction: column; gap: 0; }
        .results-divider {
          display: flex; align-items: center; gap: 16px; margin-bottom: 40px;
        }
        .results-divider::before, .results-divider::after {
          content: ''; flex: 1; height: 1px; background: var(--border);
        }
        .results-divider span { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.1em; }

        .skill-card { padding: 0 0 48px; border-bottom: 1px solid var(--border); margin-bottom: 48px; }
        .skill-card-header { margin-bottom: 20px; }
        .skill-pills { display: flex; flex-wrap: wrap; gap: 6px; }
        .pill {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 400;
          border: 1px solid var(--border); color: var(--text-muted); background: var(--bg-3);
        }
        .quality-high, .relevance-high { color: var(--green); background: var(--green-bg); border-color: var(--green-border); }
        .quality-medium, .relevance-medium { color: var(--amber); background: var(--amber-bg); border-color: var(--amber-border); }
        .quality-low, .relevance-low { color: var(--red); background: var(--red-bg); border-color: var(--red-border); }

        .skill-name {
          font-family: var(--font-display); font-size: clamp(28px, 5vw, 42px);
          font-weight: 500; letter-spacing: -0.8px; line-height: 1.15; margin-bottom: 16px;
        }
        .skill-summary { font-size: 16px; line-height: 1.75; color: var(--text-muted); font-weight: 300; margin-bottom: 32px; max-width: 560px; }

        .key-steps { margin-bottom: 32px; }
        .steps-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 14px; }
        .steps-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .step-item { display: flex; align-items: flex-start; gap: 14px; font-size: 14px; line-height: 1.6; font-weight: 300; }
        .step-num { font-family: var(--font-display); font-style: italic; font-size: 16px; color: var(--accent-2); flex-shrink: 0; width: 16px; margin-top: -1px; }

        .skill-footer { padding-top: 20px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 6px; font-size: 13px; }
        .author-by { color: var(--text-dim); }
        .author-name { color: var(--text); font-weight: 400; }
        .author-cred { color: var(--text-dim); font-weight: 300; }

        .github-section { margin-bottom: 48px; display: flex; flex-direction: column; gap: 16px; }
        .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); }
        .search-note { font-size: 13px; color: var(--text-muted); font-weight: 300; margin-top: -8px; line-height: 1.5; }

        .github-card {
          border: 1px solid var(--border); border-radius: 3px; padding: 24px;
          background: var(--bg-2); display: flex; flex-direction: column; gap: 16px;
        }
        .github-top { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; }
        .github-info { flex: 1; min-width: 0; }
        .repo-name { font-size: 15px; font-weight: 500; color: var(--text); text-decoration: none; display: block; margin-bottom: 4px; }
        .repo-name:hover { text-decoration: underline; text-underline-offset: 3px; }
        .matched-query { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 6px; font-family: var(--font-mono); }
        .repo-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 10px; line-height: 1.5; font-weight: 300; }
        .repo-meta { display: flex; gap: 14px; font-size: 12px; color: var(--text-dim); flex-wrap: wrap; }

        .trust-badge {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          width: 60px; height: 60px; border-radius: 3px; border: 1px solid; flex-shrink: 0; gap: 1px;
        }
        .trust-score { font-size: 22px; font-weight: 500; font-family: var(--font-display); line-height: 1; }
        .trust-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; }

        .skill-files { padding: 14px 16px; background: var(--bg-3); border-radius: 2px; }
        .skill-files-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin-bottom: 8px; }
        .skill-file { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); padding: 3px 0; }

        .github-actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }

        .download-btn {
          background: var(--text); color: white; border: none; padding: 10px 20px;
          font-family: var(--font-body); font-size: 13px; font-weight: 400;
          cursor: pointer; border-radius: 2px; transition: opacity 0.15s;
        }
        .download-btn:hover { opacity: 0.75; }

        .no-github { padding: 32px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-bottom: 40px; }
        .no-github-title { font-size: 15px; font-weight: 500; margin-bottom: 6px; }
        .no-github-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; font-weight: 300; line-height: 1.6; }

        .new-scan {
          background: none; border: none; padding: 0; font-family: var(--font-body);
          font-size: 13px; color: var(--text-muted); cursor: pointer;
          text-decoration: underline; text-underline-offset: 3px; margin-top: 8px;
        }
        .new-scan:hover { color: var(--text); }

        @media (max-width: 520px) {
          .main { padding: 0 18px 80px; }
          .github-top { flex-direction: column; }
          .trust-badge { flex-direction: row; width: auto; padding: 8px 14px; gap: 8px; }
        }
      `}</style>
    </main>
  )
}
