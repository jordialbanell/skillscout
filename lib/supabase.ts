import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jfakocsdpchxvjfjmzej.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export interface ScanRecord {
  id?: string
  created_at?: string
  url: string
  source: string
  author: string
  skill_name: string
  category: string
  summary: string
  key_steps: string[]
  github_repos: GithubRepoRecord[]
  search_terms: string[]
}

export interface GithubRepoRecord {
  fullName: string
  url: string
  stars: number
  trustScore: number
  trustLevel: string
  description: string
  skillFiles: string[]
  matchedQuery?: string
}
