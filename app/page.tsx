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
  otherUrls: string[]
  keySteps: string[]
  claudeRelevance: string
  contentQuality: string
  authorCredibility: string | null
  isActuallyASkill: boolean
  summary: string
}

interface GithubData {
  name: string
  fullName: string
  description: string
  stars: number
  forks: number
  lastUpdated: string
  language: string
  isForked: boolean
  url: string
  readmeContent: string
  skillFiles: string[]
  trustScore: number
  trustLevel: TrustLevel
  signals: { label: string; positive: boolean }[]
}

const CATEGORY_ICONS: Record<string, string> = {
  marketing: '📣',
  coding: '💻',
  content: '✍️',
  productivity: '⚡',
  research: '🔍',
  video: '🎬',
  design: '🎨',
  other: '🧩',
}

const SOURCE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  article: 'Article',
}

function TrustBadge({ level, score }: { level: TrustLevel; score: number }) {
  return (
    <div className={`trust-badge trust-${level}`}>
      <div className="trust-score">{score}</div>
      <div className="trust-label">{level.toUpperCase()}</div>
    </div>
  )
}

function Signal({ label, positive }: { label: string; positive: boolean }) {
  return (
    <div className="signal">
      <span className={positive ? 'signal-dot positive' : 'signal-dot negative'} />
      <span>{label}</span>
    </div>
  )
}

function StageIndicator({ stage }: { stage: Stage }) {
  const stages = [
    { key: 'extracting', label: 'Fetching content' },
    { key: 'analyzing', label: 'Analyzing with Claude' },
    { key: 'github', label: 'Checking GitHub' },
    { key: 'done', label: 'Done' },
  ]
  const currentIdx = stages.findIndex(s => s.key === stage)

  return (
    <div className="stage-indicator">
      {stages.map((s, i) => (
        <div key={s.key} className="stage-item">
          <div className={`stage-dot ${i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending'}`}>
            {i < currentIdx ? '✓' : i === currentIdx ? <span className="spinner" /> : i + 1}
          </div>
          <span className={`stage-label ${i === currentIdx ? 'active' : ''}`}>{s.label}</span>
          {i < stages.length - 1 && <div className={`stage-line ${i < currentIdx ? 'done' : ''}`} />}
        </div>
      ))}
    </div>
  )
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [extracted, setExtracted] = useState<ExtractedData | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [githubResults, setGithubResults] = useState<GithubData[]>([])

  const reset = () => {
    setStage('idle')
    setError('')
    setExtracted(null)
    setAnalysis(null)
    setGithubResults([])
  }

  const run = async () => {
    if (!url.trim()) return
    reset()

    try {
      // Step 1: Extract
      setStage('extracting')
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const extractData = await extractRes.json()
      if (!extractData.success) throw new Error(extractData.error || 'Extraction failed')
      setExtracted(extractData.data)

      // Step 2: Analyze
      setStage('analyzing')
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extractData.data),
      })
      const analyzeData = await analyzeRes.json()
      if (!analyzeData.success) throw new Error(analyzeData.error || 'Analysis failed')
      setAnalysis(analyzeData.analysis)

      // Step 3: GitHub check
      setStage('github')
      const ghUrls = analyzeData.analysis.githubUrls || []
      const ghResults: GithubData[] = []
      for (const ghUrl of ghUrls.slice(0, 3)) {
        try {
          const ghRes = await fetch('/api/github', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: ghUrl }),
          })
          const ghData = await ghRes.json()
          if (ghData.success) ghResults.push(ghData.github)
        } catch { /* ignore individual failures */ }
      }
      setGithubResults(ghResults)
      setStage('done')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      setStage('error')
    }
  }

  const downloadSkillFile = (gh: GithubData, an: Analysis) => {
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

  return (
    <main className="main">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">SkillScout</span>
        </div>
        <p className="tagline">Drop a link. We'll find the skill.</p>
      </header>

      {/* Input */}
      <section className="input-section">
        <div className="input-wrapper">
          <div className="source-hints">
            <span>instagram.com/reel/…</span>
            <span className="hint-sep">·</span>
            <span>tiktok.com/@…</span>
            <span className="hint-sep">·</span>
            <span>any article URL</span>
          </div>
          <div className="input-row">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isLoading && run()}
              placeholder="Paste URL here"
              className="url-input"
              disabled={isLoading}
            />
            <button
              onClick={run}
              disabled={isLoading || !url.trim()}
              className="scan-btn"
            >
              {isLoading ? <span className="spinner" /> : 'SCAN'}
            </button>
          </div>
        </div>
      </section>

      {/* Progress */}
      {isLoading && (
        <section className="progress-section animate-fade-in">
          <StageIndicator stage={stage} />
        </section>
      )}

      {/* Error */}
      {stage === 'error' && (
        <section className="error-section animate-fade-up">
          <div className="error-box">
            <span className="error-icon">⚠</span>
            <div>
              <div className="error-title">Could not process this URL</div>
              <div className="error-msg">{error}</div>
            </div>
            <button onClick={reset} className="retry-btn">Try again</button>
          </div>
        </section>
      )}

      {/* Results */}
      {stage === 'done' && analysis && (
        <section className="results animate-fade-up">

          {/* Skill card */}
          <div className="skill-card">
            <div className="skill-card-header">
              <div className="skill-meta">
                <span className="category-badge">
                  {CATEGORY_ICONS[analysis.skillCategory] || '🧩'} {analysis.skillCategory}
                </span>
                {extracted && (
                  <span className="source-badge">{SOURCE_LABELS[extracted.source] || extracted.source}</span>
                )}
              </div>
              <div className="relevance-badges">
                <span className={`relevance-badge quality-${analysis.contentQuality}`}>
                  Quality: {analysis.contentQuality}
                </span>
                <span className={`relevance-badge relevance-${analysis.claudeRelevance}`}>
                  Claude relevance: {analysis.claudeRelevance}
                </span>
              </div>
            </div>

            <h2 className="skill-name">{analysis.skillName}</h2>
            <p className="skill-summary">{analysis.summary}</p>

            {analysis.keySteps.length > 0 && (
              <div className="key-steps">
                <div className="steps-label">KEY STEPS</div>
                <ol className="steps-list">
                  {analysis.keySteps.map((step, i) => (
                    <li key={i} className="step-item">
                      <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {extracted?.author && (
              <div className="author-row">
                <span className="author-label">BY</span>
                <span className="author-name">@{extracted.author}</span>
                {analysis.authorCredibility && (
                  <span className="author-cred">{analysis.authorCredibility}</span>
                )}
              </div>
            )}
          </div>

          {/* GitHub results */}
          {githubResults.length > 0 && (
            <div className="github-section">
              <div className="section-label">GITHUB REPOS</div>
              {githubResults.map((gh, i) => (
                <div key={i} className="github-card">
                  <div className="github-card-top">
                    <div className="github-info">
                      <a href={gh.url} target="_blank" rel="noopener noreferrer" className="repo-name">
                        {gh.fullName}
                      </a>
                      {gh.description && <p className="repo-desc">{gh.description}</p>}
                      <div className="repo-stats">
                        <span>★ {gh.stars}</span>
                        <span>⑂ {gh.forks}</span>
                        {gh.language && <span>{gh.language}</span>}
                        <span>Updated {new Date(gh.lastUpdated).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <TrustBadge level={gh.trustLevel} score={gh.trustScore} />
                  </div>

                  <div className="signals-grid">
                    {gh.signals.map((s, j) => <Signal key={j} {...s} />)}
                  </div>

                  {gh.skillFiles.length > 0 && (
                    <div className="skill-files">
                      <div className="skill-files-label">SKILL FILES FOUND</div>
                      {gh.skillFiles.map((f, j) => (
                        <div key={j} className="skill-file-row">
                          <span className="file-icon">◈</span>
                          <span className="file-path">{f}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => downloadSkillFile(gh, analysis)}
                    className="download-btn"
                  >
                    <span>↓</span> Download .skill file
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* No GitHub repos found */}
          {githubResults.length === 0 && analysis.githubUrls.length === 0 && (
            <div className="no-github">
              <span className="no-github-icon">◎</span>
              <div>
                <div className="no-github-title">No GitHub repo found</div>
                <div className="no-github-sub">This content shares techniques but doesn't link to a downloadable skill file.</div>
              </div>
              <button onClick={() => downloadSkillFile({ url, fullName: 'manual', trustScore: 0, trustLevel: 'low', signals: [], skillFiles: [], description: '', stars: 0, forks: 0, lastUpdated: '', language: '', isForked: false, name: '', readmeContent: '' }, analysis)} className="download-btn outline">
                ↓ Generate skill file anyway
              </button>
            </div>
          )}

          {/* New scan */}
          <button onClick={reset} className="new-scan-btn">
            ← Scan another URL
          </button>
        </section>
      )}

      <style jsx>{`
        .main {
          max-width: 720px;
          margin: 0 auto;
          padding: 60px 24px 120px;
        }

        /* Header */
        .header { text-align: center; margin-bottom: 56px; }
        .logo {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .logo-icon {
          font-size: 28px;
          color: var(--accent);
          animation: pulse-accent 3s ease-in-out infinite;
        }
        .logo-text {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--text);
        }
        .tagline {
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }

        /* Input */
        .input-section { margin-bottom: 40px; }
        .input-wrapper {
          border: 1px solid var(--border);
          border-radius: 4px;
          background: var(--bg-2);
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .input-wrapper:focus-within { border-color: var(--accent-border); }
        .source-hints {
          display: flex;
          gap: 8px;
          padding: 10px 16px 0;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-dim);
          letter-spacing: 0.03em;
        }
        .hint-sep { color: var(--border-bright); }
        .input-row { display: flex; }
        .url-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          padding: 14px 16px;
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--text);
          min-width: 0;
        }
        .url-input::placeholder { color: var(--text-dim); }
        .scan-btn {
          background: var(--accent);
          color: var(--bg);
          border: none;
          padding: 0 24px;
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: opacity 0.15s;
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 80px;
          justify-content: center;
        }
        .scan-btn:hover:not(:disabled) { opacity: 0.85; }
        .scan-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Progress */
        .progress-section { margin-bottom: 40px; }
        .stage-indicator {
          display: flex;
          align-items: center;
          gap: 0;
          padding: 24px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 4px;
        }
        .stage-item {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        .stage-dot {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-mono);
          font-size: 11px;
          border: 1px solid var(--border);
          color: var(--text-dim);
          flex-shrink: 0;
          background: var(--bg);
        }
        .stage-dot.done { background: var(--accent-dim); border-color: var(--accent-border); color: var(--accent); }
        .stage-dot.active { border-color: var(--accent); background: var(--accent-dim); }
        .stage-label {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-dim);
          white-space: nowrap;
        }
        .stage-label.active { color: var(--text); }
        .stage-line {
          height: 1px;
          flex: 1;
          background: var(--border);
          margin: 0 4px;
        }
        .stage-line.done { background: var(--accent-border); }

        /* Error */
        .error-section { margin-bottom: 32px; }
        .error-box {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 20px;
          background: var(--red-dim);
          border: 1px solid rgba(255,79,110,0.25);
          border-radius: 4px;
        }
        .error-icon { font-size: 20px; color: var(--red); flex-shrink: 0; margin-top: 2px; }
        .error-title { font-weight: 600; color: var(--red); margin-bottom: 4px; }
        .error-msg { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
        .retry-btn {
          margin-left: auto;
          background: transparent;
          border: 1px solid rgba(255,79,110,0.4);
          color: var(--red);
          padding: 8px 16px;
          font-family: var(--font-display);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 2px;
          white-space: nowrap;
          transition: background 0.15s;
        }
        .retry-btn:hover { background: var(--red-dim); }

        /* Results */
        .results { display: flex; flex-direction: column; gap: 24px; }

        /* Skill card */
        .skill-card {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 28px;
        }
        .skill-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .skill-meta { display: flex; gap: 8px; flex-wrap: wrap; }
        .category-badge {
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 4px 10px;
          background: var(--accent-dim);
          border: 1px solid var(--accent-border);
          color: var(--accent);
          border-radius: 2px;
          letter-spacing: 0.03em;
        }
        .source-badge {
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 4px 10px;
          background: var(--bg-3);
          border: 1px solid var(--border);
          color: var(--text-muted);
          border-radius: 2px;
        }
        .relevance-badges { display: flex; gap: 6px; flex-wrap: wrap; }
        .relevance-badge {
          font-family: var(--font-mono);
          font-size: 10px;
          padding: 3px 8px;
          border-radius: 2px;
          border: 1px solid transparent;
        }
        .quality-high, .relevance-high { color: var(--green); background: var(--green-dim); border-color: rgba(79,255,176,0.2); }
        .quality-medium, .relevance-medium { color: var(--amber); background: var(--amber-dim); border-color: rgba(255,179,71,0.2); }
        .quality-low, .relevance-low { color: var(--red); background: var(--red-dim); border-color: rgba(255,79,110,0.2); }

        .skill-name {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin-bottom: 12px;
          color: var(--text);
          line-height: 1.2;
        }
        .skill-summary {
          font-size: 14px;
          line-height: 1.7;
          color: var(--text-muted);
          margin-bottom: 24px;
        }

        .key-steps { margin-bottom: 24px; }
        .steps-label {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          color: var(--text-dim);
          margin-bottom: 12px;
        }
        .steps-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .step-item { display: flex; align-items: flex-start; gap: 12px; font-size: 13px; line-height: 1.5; }
        .step-num {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--accent);
          flex-shrink: 0;
          margin-top: 1px;
        }

        .author-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-top: 16px;
          border-top: 1px solid var(--border);
        }
        .author-label {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-dim);
          letter-spacing: 0.1em;
        }
        .author-name {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text);
        }
        .author-cred {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-muted);
          margin-left: 4px;
        }

        /* GitHub section */
        .github-section { display: flex; flex-direction: column; gap: 16px; }
        .section-label {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          color: var(--text-dim);
        }
        .github-card {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .github-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .github-info { flex: 1; min-width: 0; }
        .repo-name {
          font-size: 16px;
          font-weight: 700;
          color: var(--text);
          text-decoration: none;
          display: block;
          margin-bottom: 4px;
        }
        .repo-name:hover { color: var(--accent); }
        .repo-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 10px; line-height: 1.5; }
        .repo-stats {
          display: flex;
          gap: 14px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-dim);
          flex-wrap: wrap;
        }

        /* Trust badge */
        .trust-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          border-radius: 4px;
          border: 1px solid;
          flex-shrink: 0;
        }
        .trust-score { font-size: 22px; font-weight: 800; line-height: 1; }
        .trust-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.1em; margin-top: 3px; }

        /* Signals */
        .signals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .signal { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
        .signal-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .signal-dot.positive { background: var(--green); }
        .signal-dot.negative { background: var(--text-dim); }

        /* Skill files */
        .skill-files {
          padding: 12px 16px;
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: 2px;
        }
        .skill-files-label { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 8px; }
        .skill-file-row { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 12px; color: var(--text); margin-bottom: 4px; }
        .file-icon { color: var(--accent); font-size: 10px; }
        .file-path { color: var(--text-muted); }

        /* Buttons */
        .download-btn {
          background: var(--accent);
          color: var(--bg);
          border: none;
          padding: 12px 20px;
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          border-radius: 2px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: opacity 0.15s;
          align-self: flex-start;
        }
        .download-btn:hover { opacity: 0.85; }
        .download-btn.outline {
          background: transparent;
          color: var(--accent);
          border: 1px solid var(--accent-border);
        }
        .download-btn.outline:hover { background: var(--accent-dim); }

        .no-github {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 24px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 4px;
        }
        .no-github-icon { font-size: 20px; color: var(--text-dim); flex-shrink: 0; margin-top: 2px; }
        .no-github-title { font-weight: 600; margin-bottom: 4px; }
        .no-github-sub { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); line-height: 1.5; }

        .new-scan-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 10px 20px;
          font-family: var(--font-mono);
          font-size: 12px;
          cursor: pointer;
          border-radius: 2px;
          transition: all 0.15s;
          align-self: flex-start;
        }
        .new-scan-btn:hover { border-color: var(--border-bright); color: var(--text); }

        @media (max-width: 600px) {
          .main { padding: 40px 16px 80px; }
          .stage-label { display: none; }
          .signals-grid { grid-template-columns: 1fr; }
          .github-card-top { flex-direction: column; }
          .trust-badge { flex-direction: row; width: auto; gap: 6px; padding: 6px 12px; }
          .skill-card-header { flex-direction: column; }
        }
      `}</style>
    </main>
  )
}
