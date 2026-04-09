'use client'

import { useState, useEffect } from 'react'

type Stage = 'idle' | 'extracting' | 'analyzing' | 'github' | 'similarity' | 'done' | 'error'
type TrustLevel = 'high' | 'medium' | 'low'
type Tab = 'scan' | 'history'

interface ExtractedData {
  author: string; caption: string; transcript: string | null; thumbnail: string | null; source: string
}
interface Analysis {
  skillName: string; skillDescription: string; skillCategory: string
  githubUrls: string[]; githubSearchTerms: string[]; otherUrls: string[]
  keySteps: string[]; claudeRelevance: string; contentQuality: string
  authorCredibility: string | null; isActuallyASkill: boolean; summary: string
}
interface GithubRepo {
  name: string; fullName: string; description: string; stars: number; forks: number
  lastUpdated: string; language: string; url: string; skillFiles: string[]
  trustScore: number; trustLevel: TrustLevel; matchedQuery?: string
}
interface ScanRecord {
  id: string; created_at: string; url: string; source: string; author: string
  skill_name: string; category: string; summary: string; key_steps: string[]
  github_repos: GithubRepo[]; search_terms: string[]
}
interface SimilarityResult {
  index: number; existingName: string; similarityLevel: 'high' | 'medium'
  reason: string; recommendation: 'keep_new' | 'keep_existing' | 'merge' | 'keep_both'
  recommendationReason: string
}
interface BatchResult {
  url: string; status: 'pending' | 'processing' | 'done' | 'error'
  error?: string; skillName?: string; category?: string; githubRepos?: GithubRepo[]
}

const CATEGORY_ICONS: Record<string, string> = {
  marketing: '📣', coding: '💻', content: '✍️', productivity: '⚡',
  research: '🔍', video: '🎬', design: '🎨', other: '🧩',
}
const SOURCE_LABELS: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', article: 'Article' }
const STAGE_LABELS: Record<string, string> = {
  extracting: 'Fetching content…', analyzing: 'Analysing with Claude…',
  github: 'Searching GitHub…', similarity: 'Checking for similar skills…',
}
const REC_LABELS: Record<string, { label: string; color: string }> = {
  keep_new: { label: 'Use new', color: 'green' },
  keep_existing: { label: 'Keep existing', color: 'amber' },
  merge: { label: 'Merge both', color: 'amber' },
  keep_both: { label: 'Keep both', color: 'green' },
}

async function processSingleUrl(url: string) {
  const extractRes = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  const extractData = await extractRes.json()
  if (!extractData.success) throw new Error(extractData.error || 'Extraction failed')
  const analyzeRes = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extractData.data) })
  const analyzeData = await analyzeRes.json()
  if (!analyzeData.success) throw new Error(analyzeData.error || 'Analysis failed')
  const an: Analysis = analyzeData.analysis
  const ghResults: GithubRepo[] = []
  for (const ghUrl of (an.githubUrls || []).slice(0, 3)) {
    try {
      const ghRes = await fetch('/api/github', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: ghUrl }) })
      const ghData = await ghRes.json()
      if (ghData.success) ghResults.push(ghData.github)
    } catch { /* ignore */ }
  }
  if (ghResults.length === 0 && an.githubSearchTerms?.length > 0) {
    try {
      const searchRes = await fetch('/api/github-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searchTerms: an.githubSearchTerms }) })
      const searchData = await searchRes.json()
      if (searchData.results?.length) ghResults.push(...searchData.results)
    } catch { /* ignore */ }
  }
  return { extracted: extractData.data, analysis: an, githubRepos: ghResults }
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('scan')
  const [urlInput, setUrlInput] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [extracted, setExtracted] = useState<ExtractedData | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [githubResults, setGithubResults] = useState<GithubRepo[]>([])
  const [similarityResults, setSimilarityResults] = useState<SimilarityResult[]>([])
  const [stageLabel, setStageLabel] = useState('')
  const [streamingLabel, setStreamingLabel] = useState('')
  const [batchMode, setBatchMode] = useState(false)
  const [batchResults, setBatchResults] = useState<BatchResult[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [history, setHistory] = useState<ScanRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const urlCount = urlInput.trim().split('\n').filter(u => u.trim().startsWith('http')).length
  const isBatch = urlCount > 1

  const STREAMING_MESSAGES = ['Fetching page...', 'Rendering content...', 'Extracting skills...', 'Analysing with Claude...']

  useEffect(() => {
    if (!isLoading) { setStreamingLabel(''); return }
    let idx = 0
    setStreamingLabel(STREAMING_MESSAGES[0])
    const timer = setInterval(() => {
      idx = Math.min(idx + 1, STREAMING_MESSAGES.length - 1)
      setStreamingLabel(STREAMING_MESSAGES[idx])
    }, 2500)
    return () => clearInterval(timer)
  }, [isLoading])

  useEffect(() => { if (tab === 'history') loadHistory() }, [tab])

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/scans')
      const data = await res.json()
      if (data.success) setHistory(data.scans)
    } catch { /* ignore */ }
    setHistoryLoading(false)
  }

  const deleteScan = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch('/api/scans', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setHistory(h => h.filter(s => s.id !== id))
    } catch { /* ignore */ }
    setDeletingId(null)
  }

  const saveScan = async (url: string, extracted: ExtractedData, analysis: Analysis, githubRepos: GithubRepo[]) => {
    try {
      await fetch('/api/scans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url, source: extracted.source, author: extracted.author,
          skill_name: analysis.skillName, category: analysis.skillCategory,
          summary: analysis.summary, key_steps: analysis.keySteps,
          github_repos: githubRepos.map(g => ({ fullName: g.fullName, url: g.url, stars: g.stars, trustScore: g.trustScore, trustLevel: g.trustLevel, description: g.description, skillFiles: g.skillFiles, matchedQuery: g.matchedQuery })),
          search_terms: analysis.githubSearchTerms || [],
        }),
      })
    } catch { /* ignore */ }
  }

  const checkSimilarity = async (analysis: Analysis, existingScans: ScanRecord[]): Promise<SimilarityResult[]> => {
    if (!existingScans.length) return []
    try {
      const res = await fetch('/api/similarity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newScan: analysis, existingScans: existingScans.slice(0, 20) }),
      })
      const data = await res.json()
      return data.similar || []
    } catch { return [] }
  }

  const reset = () => {
    setStage('idle'); setError(''); setExtracted(null)
    setAnalysis(null); setGithubResults([]); setSimilarityResults([])
    setBatchResults([]); setBatchMode(false)
  }

  const runSingle = async (url: string) => {
    try {
      setStageLabel(STAGE_LABELS.extracting); setStage('extracting')
      const extractRes = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      const extractData = await extractRes.json()
      if (!extractData.success) throw new Error(extractData.error || 'Extraction failed')
      setExtracted(extractData.data)

      setStageLabel(STAGE_LABELS.analyzing); setStage('analyzing')
      const analyzeRes = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extractData.data) })
      const analyzeData = await analyzeRes.json()
      if (!analyzeData.success) throw new Error(analyzeData.error || 'Analysis failed')
      const an: Analysis = analyzeData.analysis
      setAnalysis(an)

      setStageLabel(STAGE_LABELS.github); setStage('github')
      const ghResults: GithubRepo[] = []
      for (const ghUrl of (an.githubUrls || []).slice(0, 3)) {
        try {
          const ghRes = await fetch('/api/github', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: ghUrl }) })
          const ghData = await ghRes.json()
          if (ghData.success) ghResults.push(ghData.github)
        } catch { /* ignore */ }
      }
      if (ghResults.length === 0 && an.githubSearchTerms?.length > 0) {
        try {
          const searchRes = await fetch('/api/github-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searchTerms: an.githubSearchTerms }) })
          const searchData = await searchRes.json()
          if (searchData.results?.length) ghResults.push(...searchData.results)
        } catch { /* ignore */ }
      }
      setGithubResults(ghResults)

      setStageLabel(STAGE_LABELS.similarity); setStage('similarity')
      const currentHistory = history.length ? history : await fetch('/api/scans').then(r => r.json()).then(d => d.scans || []).catch(() => [])
      const similar = await checkSimilarity(an, currentHistory)
      setSimilarityResults(similar)

      await saveScan(url, extractData.data, an, ghResults)
      setStage('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStage('error')
    }
  }

  const runBatch = async (urls: string[]) => {
    setBatchMode(true); setBatchRunning(true)
    setBatchResults(urls.map(url => ({ url, status: 'pending' })))
    const CONCURRENCY = 3
    const queue = [...urls]
    let active = 0
    const processNext = async () => {
      if (queue.length === 0) return
      const url = queue.shift()!
      active++
      setBatchResults(prev => prev.map(r => r.url === url ? { ...r, status: 'processing' } : r))
      try {
        const { extracted, analysis, githubRepos } = await processSingleUrl(url)
        await saveScan(url, extracted, analysis, githubRepos)
        setBatchResults(prev => prev.map(r => r.url === url ? { ...r, status: 'done', skillName: analysis.skillName, category: analysis.skillCategory, githubRepos } : r))
      } catch (err) {
        setBatchResults(prev => prev.map(r => r.url === url ? { ...r, status: 'error', error: err instanceof Error ? err.message : 'Failed' } : r))
      }
      active--
      if (queue.length > 0) await processNext()
      if (active === 0 && queue.length === 0) setBatchRunning(false)
    }
    await Promise.all(Array(Math.min(CONCURRENCY, urls.length)).fill(null).map(() => processNext()))
  }

  const handleScan = () => {
    const urls = urlInput.trim().split('\n').map(u => u.trim()).filter(u => u.startsWith('http'))
    if (urls.length === 0) return
    reset()
    if (urls.length === 1) runSingle(urls[0])
    else runBatch(urls)
  }

  const downloadSkillFile = (gh: GithubRepo, an: Analysis) => {
    const content = `---\nname: ${an.skillName.toLowerCase().replace(/\s+/g, '-')}\ndescription: ${an.skillDescription} Use this skill when working on ${an.skillCategory} tasks with Claude.\n---\n\n# ${an.skillName}\n\n${an.summary}\n\n## Source\n- GitHub: ${gh.url}\n\n## Key Steps\n${an.keySteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`
    const blob = new Blob([content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${an.skillName.toLowerCase().replace(/\s+/g, '-')}.skill`
    a.click()
  }

  const getOverlaps = () => {
    const repoMap: Record<string, { repo: GithubRepo; urls: string[] }> = {}
    batchResults.forEach(r => { if (r.status === 'done' && r.githubRepos) r.githubRepos.forEach(gh => { if (!repoMap[gh.fullName]) repoMap[gh.fullName] = { repo: gh, urls: [] }; repoMap[gh.fullName].urls.push(r.url) }) })
    return Object.values(repoMap).filter(o => o.urls.length > 1)
  }

  const getHistoryOverlaps = () => {
    const repoMap: Record<string, { repoName: string; repoUrl: string; count: number }> = {}
    history.forEach(scan => scan.github_repos?.forEach((gh: GithubRepo) => { if (!repoMap[gh.fullName]) repoMap[gh.fullName] = { repoName: gh.fullName, repoUrl: gh.url, count: 0 }; repoMap[gh.fullName].count++ }))
    return Object.values(repoMap).filter(o => o.count > 1)
  }

  const isLoading = ['extracting', 'analyzing', 'github', 'similarity'].includes(stage)
  const overlaps = batchMode ? getOverlaps() : []
  const historyOverlaps = getHistoryOverlaps()

  return (
    <main className="main">
      <nav className="nav">
        <span className="nav-logo">SkillScout</span>
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === 'scan' ? 'active' : ''}`} onClick={() => { setTab('scan') }}>Scan</button>
          <button className={`nav-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            History {history.length > 0 && <span className="count">{history.length}</span>}
          </button>
        </div>
      </nav>

      {/* SCAN TAB */}
      {tab === 'scan' && (
        <>
          {/* Input — always visible at top */}
          <section className="input-section">
            {stage === 'idle' && !batchMode && (
              <div className="hero-inline">
                <h1 className="hero-title">Find the skill <em>behind the video.</em></h1>
                <p className="hero-sub">Instagram · TikTok · Google Docs · Articles. One URL or many.</p>
              </div>
            )}
            {(stage === 'idle' || stage === 'error') && !batchMode && (
              <>
                <div className={`input-box ${isBatch ? 'batch' : ''}`}>
                  <textarea
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && !isBatch && (e.preventDefault(), handleScan())}
                    placeholder={isBatch ? 'Multiple URLs detected — one per line' : 'Paste URL  ·  instagram.com/reel/…  tiktok.com/@…  docs.google.com/…'}
                    className="url-input"
                    rows={isBatch ? Math.min(urlCount + 1, 6) : 2}
                  />
                  <button onClick={handleScan} disabled={urlCount === 0} className="scan-btn">
                    {isBatch ? `Scan ${urlCount}` : 'Scan'}
                  </button>
                </div>
                {isBatch && <p className="batch-hint">{urlCount} URLs — will process up to 3 at a time</p>}
                {stage === 'error' && (
                  <div className="error-box">
                    <span className="error-title">Error: </span>
                    <span className="error-msg">{error}</span>
                    <button onClick={reset} className="link-btn" style={{marginLeft: '12px'}}>Try again →</button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Progress */}
          {isLoading && (
            <div className="stage-status animate-fade-in">
              <span className="stage-dot-pulse" />{streamingLabel || stageLabel}
            </div>
          )}

          {/* Batch results */}
          {batchMode && (
            <section className="batch-section animate-fade-up">
              <div className="batch-header">
                <p className="section-label">Batch · {batchResults.filter(r => r.status === 'done').length}/{batchResults.length} done{batchRunning ? ' · running…' : ''}</p>
                {!batchRunning && <button onClick={reset} className="link-btn">← New scan</button>}
              </div>
              {overlaps.length > 0 && (
                <div className="overlaps-box">
                  <p className="overlaps-title">🔁 Same repo across multiple videos</p>
                  {overlaps.map((o, i) => (
                    <div key={i} className="overlap-item">
                      <a href={o.repo.url} target="_blank" rel="noopener noreferrer" className="overlap-repo">{o.repo.fullName}</a>
                      <span className="overlap-count">{o.urls.length} videos</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="batch-list">
                {batchResults.map((r, i) => (
                  <div key={i} className={`batch-item status-${r.status}`}>
                    <div className="batch-item-top">
                      <div className="batch-status-icon">{r.status === 'pending' ? '○' : r.status === 'processing' ? <span className="spinner" /> : r.status === 'done' ? '✓' : '✕'}</div>
                      <div className="batch-item-info">
                        <p className="batch-url">{r.url.replace('https://', '').slice(0, 55)}…</p>
                        {r.skillName && <p className="batch-skill">{CATEGORY_ICONS[r.category || 'other']} {r.skillName}</p>}
                        {r.error && <p className="batch-error">{r.error}</p>}
                      </div>
                    </div>
                    {r.status === 'done' && r.githubRepos && r.githubRepos.length > 0 && (
                      <div className="batch-repos">
                        {r.githubRepos.slice(0, 2).map((gh, j) => (
                          <div key={j} className="batch-repo">
                            <a href={gh.url} target="_blank" rel="noopener noreferrer" className="batch-repo-name">{gh.fullName}</a>
                            <span className={`mini-trust trust-${gh.trustLevel}`}>{gh.trustScore}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Single result */}
          {stage === 'done' && analysis && !batchMode && (
            <section className="results animate-fade-up">
              <div className="results-divider"><span>Result</span></div>

              {/* Similarity alerts */}
              {similarityResults.length > 0 && (
                <div className="similarity-alerts">
                  {similarityResults.map((s, i) => {
                    const rec = REC_LABELS[s.recommendation]
                    return (
                      <div key={i} className={`similarity-alert sim-${s.similarityLevel}`}>
                        <div className="sim-header">
                          <span className="sim-icon">{s.similarityLevel === 'high' ? '⚠' : 'ℹ'}</span>
                          <span className="sim-title">Similar to <strong>"{s.existingName}"</strong> in your history</span>
                          <span className={`sim-rec rec-${rec.color}`}>{rec.label}</span>
                        </div>
                        <p className="sim-reason">{s.reason}</p>
                        <p className="sim-recommendation">{s.recommendationReason}</p>
                      </div>
                    )
                  })}
                </div>
              )}

              <article className="skill-card">
                <div className="skill-pills">
                  <span className="pill">{CATEGORY_ICONS[analysis.skillCategory]} {analysis.skillCategory}</span>
                  {extracted && <span className="pill">{SOURCE_LABELS[extracted.source] || extracted.source}</span>}
                  <span className={`pill quality-${analysis.contentQuality}`}>{analysis.contentQuality} quality</span>
                  <span className={`pill relevance-${analysis.claudeRelevance}`}>{analysis.claudeRelevance} relevance</span>
                </div>
                <h2 className="skill-name">{analysis.skillName}</h2>
                <p className="skill-summary">{analysis.summary}</p>
                {analysis.keySteps.length > 0 && (
                  <div className="key-steps">
                    <p className="steps-label">Key steps</p>
                    <ol className="steps-list">
                      {analysis.keySteps.map((step, i) => (
                        <li key={i} className="step-item"><span className="step-num">{i + 1}</span><span>{step}</span></li>
                      ))}
                    </ol>
                  </div>
                )}
                {extracted?.author && (
                  <footer className="skill-footer">
                    <span className="author-by">by</span>
                    <span className="author-name">@{extracted.author}</span>
                    {analysis.authorCredibility && <span className="author-cred">· {analysis.authorCredibility}</span>}
                  </footer>
                )}
              </article>

              {/* Deduplicated GitHub results */}
              {githubResults.length > 0 && (
                <div className="github-section">
                  <p className="section-label">{analysis.githubUrls?.length > 0 ? 'GitHub' : `GitHub — closest matches for "${analysis.skillName}"`}</p>
                  {analysis.githubUrls?.length === 0 && <p className="search-note">No repo was linked in the video.</p>}
                  {/* Deduplicate by fullName */}
                  {Array.from(new Map(githubResults.map(g => [g.fullName, g])).values()).map((gh, i) => (
                    <div key={i} className="github-card">
                      <div className="github-top">
                        <div className="github-info">
                          <a href={gh.url} target="_blank" rel="noopener noreferrer" className="repo-name">{gh.fullName}</a>
                          {gh.matchedQuery && <span className="matched-query">matched: {gh.matchedQuery}</span>}
                          {gh.description && <p className="repo-desc">{gh.description}</p>}
                          <div className="repo-meta">
                            <span>★ {gh.stars.toLocaleString()}</span>
                            {gh.language && <span>{gh.language}</span>}
                            <span>{new Date(gh.lastUpdated).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
                          </div>
                        </div>
                        <div className={`trust-badge trust-${gh.trustLevel}`}>
                          <span className="trust-score">{gh.trustScore}</span>
                          <span className="trust-label">{gh.trustLevel}</span>
                        </div>
                      </div>
                      {gh.skillFiles?.length > 0 && (
                        <div className="skill-files">
                          <p className="skill-files-label">Skill files</p>
                          {gh.skillFiles.map((f, j) => <div key={j} className="skill-file">◈ {f}</div>)}
                        </div>
                      )}
                      <div className="github-actions">
                        <a href={gh.url} target="_blank" rel="noopener noreferrer" className="link-btn">View on GitHub →</a>
                        <button onClick={() => downloadSkillFile(gh, analysis)} className="download-btn">Download .skill ↓</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {githubResults.length === 0 && (
                <div className="no-github">
                  <p className="no-github-title">No matching repos found</p>
                  <p className="no-github-sub">Generate a skill file from the extracted steps.</p>
                  <button onClick={() => downloadSkillFile({ url: urlInput, fullName: 'manual', trustScore: 0, trustLevel: 'low', skillFiles: [], description: '', stars: 0, forks: 0, lastUpdated: '', language: '', name: '' }, analysis)} className="download-btn">Generate skill file ↓</button>
                </div>
              )}

              <button onClick={reset} className="new-scan">← Scan another URL</button>
            </section>
          )}
        </>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <section className="history-section">
          <div className="history-header">
            <h2 className="history-title">Scan history</h2>
            <button onClick={loadHistory} className="link-btn">Refresh</button>
          </div>

          {historyOverlaps.length > 0 && (
            <div className="overlaps-box">
              <p className="overlaps-title">🔁 Repos appearing across multiple scans</p>
              {historyOverlaps.map((o, i) => (
                <div key={i} className="overlap-item">
                  <a href={o.repoUrl} target="_blank" rel="noopener noreferrer" className="overlap-repo">{o.repoName}</a>
                  <span className="overlap-count">{o.count} scans</span>
                </div>
              ))}
            </div>
          )}

          {historyLoading && <p className="loading-msg">Loading…</p>}
          {!historyLoading && history.length === 0 && <p className="empty-msg">No scans yet.</p>}

          <div className="history-list">
            {history.map((scan) => (
              <div key={scan.id} className="history-item">
                <div className="history-item-header">
                  <span className="pill">{CATEGORY_ICONS[scan.category] || '🧩'} {scan.category}</span>
                  <div className="history-item-actions">
                    <span className="history-date">{new Date(scan.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <button
                      onClick={() => deleteScan(scan.id)}
                      disabled={deletingId === scan.id}
                      className="delete-btn"
                      title="Delete"
                    >
                      {deletingId === scan.id ? '…' : '✕'}
                    </button>
                  </div>
                </div>
                <h3 className="history-skill-name">{scan.skill_name}</h3>
                <p className="history-summary">{scan.summary}</p>
                <p className="history-url">{scan.url.replace('https://', '').slice(0, 65)}</p>
                {scan.github_repos?.length > 0 && (
                  <div className="history-repos">
                    {Array.from(new Map(scan.github_repos.map((g: GithubRepo) => [g.fullName, g])).values()).slice(0, 3).map((gh, j) => (
                      <div key={j} className="batch-repo">
                        <a href={(gh as GithubRepo).url} target="_blank" rel="noopener noreferrer" className="batch-repo-name">{(gh as GithubRepo).fullName}</a>
                        <span className={`mini-trust trust-${(gh as GithubRepo).trustLevel}`}>{(gh as GithubRepo).trustScore}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <style jsx>{`
        .main { max-width: 680px; margin: 0 auto; padding: 0 24px 120px; }

        .nav { display: flex; align-items: center; justify-content: space-between; padding: 24px 0 16px; border-bottom: 1px solid var(--border); margin-bottom: 0; }
        .nav-logo { font-family: var(--font-display); font-size: 20px; font-weight: 600; letter-spacing: -0.3px; }
        .nav-tabs { display: flex; gap: 4px; }
        .nav-tab { background: none; border: 1px solid transparent; padding: 6px 14px; font-family: var(--font-body); font-size: 13px; color: var(--text-muted); cursor: pointer; border-radius: 100px; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
        .nav-tab:hover { color: var(--text); }
        .nav-tab.active { color: var(--text); border-color: var(--border-dark); background: var(--bg-2); }
        .count { background: var(--bg-3); border: 1px solid var(--border); border-radius: 100px; padding: 1px 6px; font-size: 10px; color: var(--text-muted); }

        /* Input always at top */
        .input-section { padding: 28px 0 0; }
        .hero-inline { margin-bottom: 20px; }
        .hero-title { font-family: var(--font-display); font-size: clamp(24px, 4vw, 40px); font-weight: 500; line-height: 1.15; letter-spacing: -0.8px; margin-bottom: 6px; }
        .hero-title em { font-style: italic; color: var(--text-muted); }
        .hero-sub { font-size: 13px; color: var(--text-dim); font-weight: 300; }

        .input-box { display: flex; align-items: stretch; border: 1.5px solid var(--border-dark); border-radius: 4px; background: var(--bg-2); transition: border-color 0.2s, box-shadow 0.2s; overflow: hidden; }
        .input-box:focus-within { border-color: var(--text); box-shadow: 0 0 0 3px rgba(26,25,21,0.07); }
        .url-input { flex: 1; border: none; outline: none; padding: 14px 16px; font-family: var(--font-body); font-size: 15px; font-weight: 300; color: var(--text); background: transparent; min-width: 0; resize: none; line-height: 1.5; }
        .url-input::placeholder { color: var(--text-dim); }
        .scan-btn { background: var(--text); color: white; border: none; padding: 0 22px; font-family: var(--font-body); font-size: 13px; font-weight: 500; letter-spacing: 0.03em; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; min-width: 72px; flex-shrink: 0; }
        .scan-btn:hover:not(:disabled) { opacity: 0.8; }
        .scan-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .batch-hint { font-size: 12px; color: var(--text-muted); margin-top: 8px; font-weight: 300; }

        .error-box { margin-top: 12px; padding: 14px 16px; border: 1px solid var(--red-border); border-radius: 3px; background: var(--red-bg); font-size: 13px; }
        .error-title { font-weight: 500; color: var(--red); }
        .error-msg { color: var(--text-muted); font-weight: 300; }
        .link-btn { background: none; border: none; padding: 0; font-family: var(--font-body); font-size: 13px; color: var(--text); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
        .link-btn:hover { opacity: 0.6; }

        .stage-status { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-muted); font-weight: 300; padding: 20px 0; }
        .stage-dot-pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-2); animation: pulse 1.4s ease-in-out infinite; flex-shrink: 0; }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }

        /* Similarity alerts */
        .similarity-alerts { display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px; }
        .similarity-alert { padding: 16px 18px; border-radius: 4px; border: 1px solid; }
        .sim-high { background: var(--amber-bg); border-color: var(--amber-border); }
        .sim-medium { background: var(--bg-3); border-color: var(--border); }
        .sim-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
        .sim-icon { font-size: 14px; }
        .sim-title { font-size: 13px; flex: 1; }
        .sim-title strong { font-weight: 600; }
        .sim-rec { font-size: 11px; padding: 3px 8px; border-radius: 100px; font-weight: 500; border: 1px solid; white-space: nowrap; }
        .rec-green { color: var(--green); background: var(--green-bg); border-color: var(--green-border); }
        .rec-amber { color: var(--amber); background: var(--amber-bg); border-color: var(--amber-border); }
        .sim-reason { font-size: 12px; color: var(--text-muted); font-weight: 300; margin-bottom: 4px; }
        .sim-recommendation { font-size: 12px; color: var(--text-muted); font-weight: 400; font-style: italic; }

        /* Batch */
        .batch-section { margin-top: 32px; }
        .batch-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .batch-list { display: flex; flex-direction: column; gap: 8px; }
        .batch-item { padding: 14px 16px; border: 1px solid var(--border); border-radius: 3px; background: var(--bg-2); }
        .batch-item.status-processing { border-color: var(--amber-border); background: var(--amber-bg); }
        .batch-item.status-done { border-color: var(--green-border); }
        .batch-item.status-error { border-color: var(--red-border); background: var(--red-bg); }
        .batch-item-top { display: flex; gap: 12px; align-items: flex-start; }
        .batch-status-icon { font-size: 13px; color: var(--text-muted); flex-shrink: 0; margin-top: 1px; width: 16px; }
        .status-done .batch-status-icon { color: var(--green); }
        .status-error .batch-status-icon { color: var(--red); }
        .batch-item-info { flex: 1; min-width: 0; }
        .batch-url { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .batch-skill { font-size: 13px; font-weight: 500; }
        .batch-error { font-size: 12px; color: var(--red); font-weight: 300; }
        .batch-repos { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 5px; }
        .batch-repo { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .batch-repo-name { font-size: 12px; color: var(--text); text-decoration: none; }
        .batch-repo-name:hover { text-decoration: underline; text-underline-offset: 2px; }
        .mini-trust { font-size: 10px; font-weight: 500; padding: 2px 7px; border-radius: 100px; border: 1px solid; }

        .overlaps-box { padding: 14px 18px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 3px; margin-bottom: 16px; }
        .overlaps-title { font-size: 13px; font-weight: 500; margin-bottom: 8px; }
        .overlap-item { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; border-top: 1px solid var(--border); }
        .overlap-repo { font-size: 13px; color: var(--text); text-decoration: none; }
        .overlap-repo:hover { text-decoration: underline; text-underline-offset: 2px; }
        .overlap-count { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }

        /* Results */
        .results { display: flex; flex-direction: column; gap: 0; }
        .results-divider { display: flex; align-items: center; gap: 16px; margin: 32px 0 28px; }
        .results-divider::before, .results-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
        .results-divider span { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.1em; }

        .skill-card { padding: 0 0 36px; border-bottom: 1px solid var(--border); margin-bottom: 36px; }
        .skill-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
        .pill { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 100px; font-size: 11px; border: 1px solid var(--border); color: var(--text-muted); background: var(--bg-3); }
        .quality-high, .relevance-high { color: var(--green); background: var(--green-bg); border-color: var(--green-border); }
        .quality-medium, .relevance-medium { color: var(--amber); background: var(--amber-bg); border-color: var(--amber-border); }
        .quality-low, .relevance-low { color: var(--red); background: var(--red-bg); border-color: var(--red-border); }

        .skill-name { font-family: var(--font-display); font-size: clamp(24px, 4vw, 36px); font-weight: 500; letter-spacing: -0.6px; line-height: 1.15; margin-bottom: 12px; }
        .skill-summary { font-size: 15px; line-height: 1.75; color: var(--text-muted); font-weight: 300; margin-bottom: 24px; }
        .key-steps { margin-bottom: 24px; }
        .steps-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 10px; }
        .steps-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .step-item { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; line-height: 1.6; font-weight: 300; }
        .step-num { font-family: var(--font-display); font-style: italic; font-size: 15px; color: var(--accent-2); flex-shrink: 0; width: 14px; }
        .skill-footer { padding-top: 16px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 6px; font-size: 13px; }
        .author-by { color: var(--text-dim); }
        .author-name { color: var(--text); }
        .author-cred { color: var(--text-dim); font-weight: 300; }

        .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 10px; }
        .search-note { font-size: 13px; color: var(--text-muted); font-weight: 300; margin-top: -4px; margin-bottom: 12px; }
        .github-section { margin-bottom: 36px; display: flex; flex-direction: column; gap: 12px; }
        .github-card { border: 1px solid var(--border); border-radius: 3px; padding: 20px; background: var(--bg-2); display: flex; flex-direction: column; gap: 14px; }
        .github-top { display: flex; gap: 14px; justify-content: space-between; align-items: flex-start; }
        .github-info { flex: 1; min-width: 0; }
        .repo-name { font-size: 15px; font-weight: 500; color: var(--text); text-decoration: none; display: block; margin-bottom: 3px; }
        .repo-name:hover { text-decoration: underline; text-underline-offset: 2px; }
        .matched-query { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 5px; font-family: var(--font-mono); }
        .repo-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.5; font-weight: 300; }
        .repo-meta { display: flex; gap: 12px; font-size: 12px; color: var(--text-dim); flex-wrap: wrap; }
        .trust-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 3px; border: 1px solid; flex-shrink: 0; }
        .trust-score { font-size: 19px; font-weight: 500; font-family: var(--font-display); line-height: 1; }
        .trust-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
        .skill-files { padding: 10px 14px; background: var(--bg-3); border-radius: 2px; }
        .skill-files-label { font-size: 11px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 5px; }
        .skill-file { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); padding: 2px 0; }
        .github-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .download-btn { background: var(--text); color: white; border: none; padding: 9px 18px; font-family: var(--font-body); font-size: 13px; cursor: pointer; border-radius: 2px; transition: opacity 0.15s; }
        .download-btn:hover { opacity: 0.75; }
        .no-github { padding: 24px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-bottom: 28px; }
        .no-github-title { font-size: 15px; font-weight: 500; margin-bottom: 5px; }
        .no-github-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 14px; font-weight: 300; }
        .new-scan { background: none; border: none; padding: 0; font-family: var(--font-body); font-size: 13px; color: var(--text-muted); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
        .new-scan:hover { color: var(--text); }

        /* History */
        .history-section { margin-top: 32px; }
        .history-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; }
        .history-title { font-family: var(--font-display); font-size: 26px; font-weight: 500; letter-spacing: -0.4px; }
        .loading-msg, .empty-msg { font-size: 14px; color: var(--text-muted); font-weight: 300; padding: 32px 0; }
        .history-list { display: flex; flex-direction: column; }
        .history-item { padding: 20px 0; border-bottom: 1px solid var(--border); }
        .history-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .history-item-actions { display: flex; align-items: center; gap: 12px; }
        .history-date { font-size: 12px; color: var(--text-dim); font-family: var(--font-mono); }
        .delete-btn { background: none; border: none; padding: 4px 6px; font-size: 11px; color: var(--text-dim); cursor: pointer; border-radius: 2px; transition: all 0.15s; line-height: 1; }
        .delete-btn:hover { background: var(--red-bg); color: var(--red); }
        .delete-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .history-skill-name { font-family: var(--font-display); font-size: 18px; font-weight: 500; letter-spacing: -0.2px; margin-bottom: 5px; }
        .history-summary { font-size: 13px; color: var(--text-muted); line-height: 1.6; font-weight: 300; margin-bottom: 6px; }
        .history-url { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .history-repos { display: flex; flex-direction: column; gap: 4px; }

        @media (max-width: 640px) {
          .main { padding: 0 16px 80px; }
          .nav { padding: 16px 0 14px; }
          .url-input { font-size: 16px; }
          .scan-btn { min-width: 60px; padding: 0 14px; }
          .github-top { flex-direction: column; }
          .trust-badge { flex-direction: row; width: auto; padding: 5px 10px; gap: 6px; }
          .skill-name { font-size: 22px; }
          .history-title { font-size: 22px; }
        }
      `}</style>
    </main>
  )
}
