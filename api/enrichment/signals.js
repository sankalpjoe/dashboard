/**
 * Signal Discovery API — Vercel Edge Function
 * Discovers activity signals for a company from public sources:
 * - News mentions (Hacker News)
 * - GitHub activity spikes
 * - Job posting signals (HN hiring threads)
 *
 * GET /api/enrichment/signals?company=Stripe&domain=stripe.com
 */

import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';
import { checkRateLimit } from '../_rate-limit.js';

export const config = { runtime: 'edge' };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SIGNAL_KEYWORDS = {
  hiring_surge: ['hiring', 'we\'re hiring', 'join our team', 'open positions', 'new roles', 'growing team', 'talent acquisition', 'recruiting'],
  funding_event: ['raised', 'funding', 'series a', 'series b', 'series c', 'investment', 'valuation', 'backed by', 'investors', 'venture capital', 'seed round'],
  expansion_signal: ['expansion', 'new office', 'opening', 'entering market', 'new region', 'international', 'global expansion', 'new location'],
  technology_adoption: ['migrating to', 'adopting', 'implementing', 'rolling out', 'tech stack', 'infrastructure', 'switching to', 'moving to'],
  executive_movement: ['appointed', 'joins as', 'new ceo', 'new cto', 'new cfo', 'new coo', 'new vp', 'leadership change', 'promoted to', 'chief', 'executive', 'founder'],
  financial_trigger: ['revenue', 'ipo', 'acquisition', 'merger', 'quarterly results', 'earnings', 'profit', 'loss', 'valuation', 'market cap'],
};

function classifySignal(text) {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return type;
    }
  }
  return 'press_release';
}

function scoreSignalStrength(points, comments, recencyDays) {
  let score = 0;
  if (points > 100) score += 3;
  else if (points > 30) score += 2;
  else score += 1;

  if (comments > 50) score += 2;
  else if (comments > 10) score += 1;

  if (recencyDays <= 3) score += 3;
  else if (recencyDays <= 7) score += 2;
  else if (recencyDays <= 14) score += 1;

  if (score >= 7) return 'critical';
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

async function fetchHNSignals(companyName) {
  try {
    // Strict 30-day window
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 86400);
    
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(companyName)}&tags=story&hitsPerPage=50&numericFilters=created_at_i>${thirtyDaysAgo}`,
      {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const now = Date.now();

    // C-level and firm-specific filters
    const cLevelKeywords = ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cpo', 'ciso', 'chief', 'founder', 'co-founder', 'president', 'executive'];
    const firmKeywords = ['announces', 'launches', 'raises', 'acquires', 'acquired', 'funding', 'ipo', 'layoffs', 'expands', 'partnership', 'merger'];

    return (data.hits || [])
      .filter((h) => {
        const titleLower = (h.title || '').toLowerCase();
        const companyLower = companyName.toLowerCase();
        
        // Must contain company name
        if (!titleLower.includes(companyLower)) return false;
        
        // Must be about C-level or major firm events
        const hasCLevel = cLevelKeywords.some(k => titleLower.includes(k));
        const isFirmEvent = firmKeywords.some(k => titleLower.includes(k));
        
        // Must have minimum engagement (quality filter)
        const hasEngagement = (h.points || 0) >= 10 || (h.num_comments || 0) >= 5;
        
        return (hasCLevel || isFirmEvent) && hasEngagement;
      })
      .map((h) => {
        const recencyDays = (now - new Date(h.created_at).getTime()) / 86400000;
        const signalType = classifySignal(h.title);
        
        return {
          type: signalType,
          title: h.title,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          source: 'Hacker News',
          sourceTier: 2,
          timestamp: h.created_at,
          strength: scoreSignalStrength(h.points || 0, h.num_comments || 0, recencyDays),
          engagement: { points: h.points, comments: h.num_comments },
          recencyDays: Math.round(recencyDays),
        };
      })
      .sort((a, b) => {
        // Sort by strength, then recency
        const strengthOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const strengthDiff = strengthOrder[b.strength] - strengthOrder[a.strength];
        if (strengthDiff !== 0) return strengthDiff;
        return a.recencyDays - b.recencyDays;
      })
      .slice(0, 20); // Top 20 most relevant signals
  } catch {
    return [];
  }
}

async function fetchGitHubSignals(orgName) {
  try {
    const res = await fetch(
      `https://api.github.com/orgs/${encodeURIComponent(orgName)}/repos?sort=created&per_page=20`,
      {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': UA },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return [];
    const repos = await res.json();
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;

    // Only repos created in last 30 days
    const recentRepos = repos.filter((r) => new Date(r.created_at).getTime() > thirtyDaysAgo);
    
    if (recentRepos.length === 0) return [];

    return recentRepos.map((r) => {
      const daysSinceCreation = (now - new Date(r.created_at).getTime()) / 86400000;
      
      // Determine if this is a significant repo
      const isSignificant = r.stargazers_count > 50 || 
                           r.description?.toLowerCase().includes('official') ||
                           r.description?.toLowerCase().includes('product') ||
                           !r.fork;
      
      let strength: 'critical' | 'high' | 'medium' | 'low';
      if (r.stargazers_count > 100) strength = 'critical';
      else if (r.stargazers_count > 50 || isSignificant) strength = 'high';
      else if (r.stargazers_count > 10) strength = 'medium';
      else strength = 'low';

      return {
        type: 'technology_adoption',
        title: `New ${isSignificant ? 'official ' : ''}repository: ${r.full_name}${r.description ? ` — ${r.description}` : ''}`,
        url: r.html_url,
        source: 'GitHub',
        sourceTier: 2,
        timestamp: r.created_at,
        strength,
        engagement: { 
          stars: r.stargazers_count, 
          forks: r.forks_count,
          watchers: r.watchers_count,
        },
        recencyDays: Math.round(daysSinceCreation),
      };
    }).filter(signal => signal.strength !== 'low'); // Only return medium+ signals
  } catch {
    return [];
  }
}

async function fetchJobSignals(companyName) {
  try {
    // Only last 30 days for hiring signals
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 86400);
    
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(companyName)}&tags=comment,ask_hn&hitsPerPage=30&numericFilters=created_at_i>${thirtyDaysAgo}`,
      {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();

    const hiringComments = (data.hits || []).filter((h) => {
      const text = (h.comment_text || '').toLowerCase();
      const companyLower = companyName.toLowerCase();
      
      // Must mention company and hiring keywords
      const mentionsCompany = text.includes(companyLower);
      const isHiring = text.includes('hiring') || text.includes('job') || text.includes('apply') || text.includes('positions');
      
      // Filter for official hiring posts (not just mentions)
      const isOfficial = text.includes('we\'re hiring') || 
                         text.includes('join us') || 
                         text.includes('careers') ||
                         text.includes('open roles');
      
      return mentionsCompany && isHiring && isOfficial;
    });

    if (hiringComments.length === 0) return [];

    // Calculate hiring velocity (mentions per week)
    const weeksInPeriod = 4; // 30 days ≈ 4 weeks
    const hiringVelocity = hiringComments.length / weeksInPeriod;
    
    let strength: 'critical' | 'high' | 'medium' | 'low';
    if (hiringVelocity >= 2) strength = 'critical'; // 2+ posts per week
    else if (hiringVelocity >= 1) strength = 'high';
    else if (hiringVelocity >= 0.5) strength = 'medium';
    else strength = 'low';

    return [{
      type: 'hiring_surge',
      title: `${companyName} active hiring — ${hiringComments.length} official posts in last 30 days (${hiringVelocity.toFixed(1)}/week)`,
      url: `https://news.ycombinator.com/item?id=${hiringComments[0].story_id}`,
      source: 'HN Hiring Threads',
      sourceTier: 3,
      timestamp: hiringComments[0].created_at,
      strength,
      engagement: { 
        mentions: hiringComments.length,
        velocity: parseFloat(hiringVelocity.toFixed(1)),
      },
    }];
  } catch {
    return [];
  }
}

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (isDisallowedOrigin(req)) {
    return new Response('Forbidden', { status: 403, headers: cors });
  }

  const rateLimitResult = await checkRateLimit(req, 'signals', 20, '60s');
  if (rateLimitResult) return rateLimitResult;

  const url = new URL(req.url);
  const company = url.searchParams.get('company')?.trim();
  const domain = url.searchParams.get('domain')?.trim().toLowerCase();

  if (!company) {
    return new Response(JSON.stringify({ error: 'Provide ?company= parameter' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const orgName = domain?.replace(/\.(com|io|co|org|net|ai|dev|app)$/, '').split('.').pop() || company.toLowerCase().replace(/\s+/g, '');

  const [hnSignals, githubSignals, jobSignals] = await Promise.all([
    fetchHNSignals(company),
    fetchGitHubSignals(orgName),
    fetchJobSignals(company),
  ]);

  const allSignals = [...hnSignals, ...githubSignals, ...jobSignals]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const signalTypeCounts = {};
  for (const s of allSignals) {
    signalTypeCounts[s.type] = (signalTypeCounts[s.type] || 0) + 1;
  }

  const result = {
    company,
    domain: domain || null,
    signals: allSignals,
    summary: {
      totalSignals: allSignals.length,
      byType: signalTypeCounts,
      strongestSignal: allSignals[0] || null,
      signalDiversity: Object.keys(signalTypeCounts).length,
    },
    discoveredAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    },
  });
}
