import { NextRequest, NextResponse } from 'next/server'

const APIFY_TOKEN = process.env.APIFY_API_TOKEN

type SourceType = 'instagram' | 'tiktok' | 'article' | 'googledoc' | 'notion' | 'unknown'

function detectSource(url: string): SourceType {
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('tiktok.com') || url.includes('vm.tiktok.com')) return 'tiktok'
  if (url.includes('docs.google.com/document')) return 'googledoc'
  if (url.includes('notion.so') || url.includes('notion.site')) return 'notion'
  if (url.startsWith('http')) return 'article'
  return 'unknown'
}

async function pollApifyRun(runId: string, maxWait = 60000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
    const data = await res.json()
    const status = data?.data?.status
    if (status === 'SUCCEEDED') return true
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) return false
  }
  return false
}

async function fetchInstagram(url: string) {
  if (!APIFY_TOKEN) throw new Error('APIFY_API_TOKEN not set')
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-reel-scraper/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: [url], includeTranscript: true, resultsLimit: 1 }),
    }
  )
  if (!runRes.ok) throw new Error('Apify Instagram run failed')
  const runData = await runRes.json()
  const runId = runData?.data?.id
  if (!runId) throw new Error('No run ID returned')
  const succeeded = await pollApifyRun(runId)
  if (!succeeded) throw new Error('Apify run did not succeed in time')
  const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`)
  const items = await datasetRes.json()
  const item = items?.[0]
  if (!item) throw new Error('No data returned from Apify')
  return {
    author: item.ownerUsername || 'Unknown',
    caption: item.caption || '',
    transcript: item.transcript || null,
    thumbnail: item.displayUrl || null,
    source: 'instagram' as SourceType,
  }
}

async function fetchTikTok(url: string) {
  const oembedRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
  let author = 'Unknown', caption = ''
  if (oembedRes.ok) {
    const oembed = await oembedRes.json()
    author = oembed.author_name || 'Unknown'
    caption = oembed.title || ''
  }
  let transcript: string | null = null
  if (APIFY_TOKEN) {
    try {
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?token=${APIFY_TOKEN}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postURLs: [url], shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: true, shouldDownloadSlideshowImages: false }),
        }
      )
      if (runRes.ok) {
        const runData = await runRes.json()
        const runId = runData?.data?.id
        if (runId && await pollApifyRun(runId)) {
          const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`)
          const items = await datasetRes.json()
          const item = items?.[0]
          if (item?.subtitles?.length > 0) transcript = item.subtitles.map((s: { text: string }) => s.text).join(' ')
          else if (item?.text) transcript = item.text
        }
      }
    } catch { /* ignore */ }
  }
  return { author, caption, transcript, thumbnail: null, source: 'tiktok' as SourceType }
}

async function fetchGoogleDoc(url: string) {
  // Extract doc ID from various Google Docs URL formats
  const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (!idMatch) throw new Error('Could not parse Google Doc ID')
  const docId = idMatch[1]

  // Try export as plain text first (works for public docs)
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`
  const res = await fetch(exportUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SkillScout/1.0)' },
    redirect: 'follow',
  })

  if (res.ok) {
    const text = await res.text()
    if (text && text.length > 100) {
      return {
        author: 'Google Doc',
        caption: 'Google Doc',
        transcript: text.slice(0, 10000),
        thumbnail: null,
        source: 'article' as SourceType,
      }
    }
  }

  // Fallback: try mobilebasic HTML
  const mobileUrl = `https://docs.google.com/document/d/${docId}/mobilebasic`
  const mobileRes = await fetch(mobileUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
  })
  if (!mobileRes.ok) throw new Error('Google Doc is not publicly accessible')
  const html = await mobileRes.text()
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000)

  if (text.length < 100) throw new Error('Google Doc appears to be empty or private')

  return {
    author: 'Google Doc',
    caption: 'Google Doc',
    transcript: text,
    thumbnail: null,
    source: 'article' as SourceType,
  }
}

async function fetchNotion(url: string) {
  if (!APIFY_TOKEN) throw new Error('APIFY_API_TOKEN not set')
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/apify~web-scraper/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url }],
        pageFunction: `async function pageFunction(context) {
          const { page } = context;
          await page.waitForTimeout(3000);
          const text = await page.evaluate(() => document.body.innerText);
          return { text: text.slice(0, 10000) };
        }`,
        maxPagesPerCrawl: 1,
        runMode: 'DEVELOPMENT',
      }),
    }
  )
  if (!runRes.ok) {
    const errBody = await runRes.text()
    console.error('Apify Notion run failed:', errBody)
    throw new Error(`Apify Notion run failed: ${errBody}`)
  }
  const runData = await runRes.json()
  const runId = runData?.data?.id
  if (!runId) throw new Error('No run ID returned')
  const succeeded = await pollApifyRun(runId, 120000)
  if (!succeeded) throw new Error('Apify run did not succeed in time')
  const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`)
  const items = await datasetRes.json()
  console.log('Notion dataset:', JSON.stringify(items))
  const text = items?.[0]?.text
  if (!text || text.length < 50) throw new Error('Notion page appears empty or private')
  return {
    author: 'Notion',
    caption: 'Notion Page',
    transcript: text,
    thumbnail: null,
    source: 'article' as SourceType,
  }
}

async function fetchArticle(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SkillScout/1.0)' },
  })
  if (!res.ok) throw new Error(`Could not fetch article: ${res.status}`)
  const html = await res.text()
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : url
  return { author: 'Article', caption: title, transcript: text, thumbnail: null, source: 'article' as SourceType }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    const source = detectSource(url)
    if (source === 'unknown') return NextResponse.json({ error: 'Unsupported URL type' }, { status: 400 })
    let data
    if (source === 'instagram') data = await fetchInstagram(url)
    else if (source === 'tiktok') data = await fetchTikTok(url)
    else if (source === 'googledoc') data = await fetchGoogleDoc(url)
    else if (source === 'notion') data = await fetchNotion(url)
    else data = await fetchArticle(url)
    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
