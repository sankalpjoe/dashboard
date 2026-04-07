/**
 * Sentiment Analysis API
 * Analyzes text for positive/negative/neutral sentiment
 */

import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';
import { checkRateLimit } from '../_rate-limit.js';

export const config = { runtime: 'edge' };

// Comprehensive sentiment lexicon
const NEGATIVE_KEYWORDS = [
  // Legal/Criminal
  'scandal', 'controversy', 'lawsuit', 'fraud', 'investigation', 'criminal', 'arrest',
  'indicted', 'guilty', 'convicted', 'accused', 'alleged', 'sued', 'complaint',
  // Business Negative
  'bankrupt', 'collapse', 'crisis', 'failure', 'loss', 'decline', 'plunge', 'crash',
  'layoff', 'fired', 'resigned', 'ousted', 'terminated', 'downsizing', 'closure',
  // Security/Risk
  'breach', 'hack', 'leak', 'exposed', 'vulnerability', 'attack', 'threat', 'risk',
  // Misconduct
  'misconduct', 'violation', 'penalty', 'fine', 'sanction', 'whistleblower', 'corruption',
  // Negative Emotions
  'disaster', 'catastrophe', 'terrible', 'awful', 'horrible', 'worst', 'failed',
  'disappointing', 'concerning', 'alarming', 'troubling', 'problematic', 'dangerous',
  // Market Negative
  'bearish', 'downturn', 'recession', 'depression', 'slump', 'deficit', 'debt'
];

const POSITIVE_KEYWORDS = [
  // Achievement
  'award', 'achievement', 'success', 'excellence', 'outstanding', 'exceptional',
  'milestone', 'breakthrough', 'innovation', 'revolutionary', 'pioneering',
  // Growth
  'growth', 'expansion', 'increase', 'surge', 'soar', 'boom', 'profit', 'gain',
  'revenue', 'earnings', 'record', 'high', 'peak', 'rise', 'rally',
  // Leadership
  'leader', 'pioneer', 'visionary', 'expert', 'authority', 'champion', 'winner',
  'promoted', 'appointed', 'hired', 'joined', 'recruited',
  // Business Positive
  'funding', 'investment', 'acquisition', 'partnership', 'collaboration', 'deal',
  'launched', 'released', 'unveiled', 'announced', 'introduced',
  // Positive Emotions
  'excellent', 'great', 'amazing', 'fantastic', 'wonderful', 'impressive',
  'strong', 'robust', 'solid', 'promising', 'optimistic', 'confident',
  // Market Positive
  'bullish', 'upturn', 'recovery', 'rebound', 'momentum', 'upgrade'
];

// Intensifiers and negations
const INTENSIFIERS = ['very', 'extremely', 'highly', 'incredibly', 'absolutely', 'completely'];
const NEGATIONS = ['not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere', "n't"];

// Financial sentiment patterns
const FINANCIAL_PATTERNS = {
  positive: [
    /beat\s+expectations?/i,
    /exceeded?\s+forecast/i,
    /strong\s+earnings?/i,
    /record\s+revenue/i,
    /upgraded?\s+to\s+buy/i,
    /raised?\s+guidance/i,
    /outperform/i,
  ],
  negative: [
    /missed?\s+expectations?/i,
    /below\s+forecast/i,
    /weak\s+earnings?/i,
    /downgraded?\s+to\s+sell/i,
    /lowered?\s+guidance/i,
    /underperform/i,
    /profit\s+warning/i,
  ],
};

function analyzeSentiment(text) {
  if (!text || typeof text !== 'string') {
    return {
      sentiment: 'neutral',
      score: 0,
      confidence: 0,
      breakdown: { positive: 0, negative: 0, neutral: 0 },
    };
  }

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);

  let positiveScore = 0;
  let negativeScore = 0;
  let intensifierMultiplier = 1;
  let negationActive = false;

  // Check financial patterns first (higher weight)
  FINANCIAL_PATTERNS.positive.forEach(pattern => {
    if (pattern.test(text)) positiveScore += 3;
  });
  FINANCIAL_PATTERNS.negative.forEach(pattern => {
    if (pattern.test(text)) negativeScore += 3;
  });

  // Word-by-word analysis
  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Check for intensifiers
    if (INTENSIFIERS.includes(word)) {
      intensifierMultiplier = 1.5;
      continue;
    }

    // Check for negations
    if (NEGATIONS.some(neg => word.includes(neg))) {
      negationActive = true;
      continue;
    }

    // Check sentiment
    const isPositive = POSITIVE_KEYWORDS.some(kw => word.includes(kw));
    const isNegative = NEGATIVE_KEYWORDS.some(kw => word.includes(kw));

    if (isPositive) {
      const score = 1 * intensifierMultiplier;
      if (negationActive) {
        negativeScore += score; // Negated positive = negative
      } else {
        positiveScore += score;
      }
    }

    if (isNegative) {
      const score = 1 * intensifierMultiplier;
      if (negationActive) {
        positiveScore += score; // Negated negative = positive
      } else {
        negativeScore += score;
      }
    }

    // Reset modifiers
    intensifierMultiplier = 1;
    negationActive = false;
  }

  // Calculate final sentiment
  const totalScore = positiveScore + negativeScore;
  const netScore = positiveScore - negativeScore;

  let sentiment = 'neutral';
  let confidence = 0;

  if (totalScore > 0) {
    const ratio = Math.abs(netScore) / totalScore;
    confidence = Math.min(ratio * 100, 100);

    if (netScore > 0.5) {
      sentiment = 'positive';
    } else if (netScore < -0.5) {
      sentiment = 'negative';
    }
  }

  // Normalize score to -1 to +1 range
  const normalizedScore = totalScore > 0 ? netScore / totalScore : 0;

  return {
    sentiment,
    score: Math.round(normalizedScore * 100) / 100,
    confidence: Math.round(confidence),
    breakdown: {
      positive: positiveScore,
      negative: negativeScore,
      neutral: totalScore === 0 ? 1 : 0,
    },
    details: {
      totalWords: words.length,
      sentimentWords: totalScore,
      positiveKeywords: positiveScore,
      negativeKeywords: negativeScore,
    },
  };
}

// Fetch with timeout
async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchUrlContent(url) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    if (!response.ok) return null;
    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract og:description or meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i) ||
      html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract all paragraph text
    const paragraphs = html.match(/<p>(.*?)<\/p>/gi) || [];
    const cleanParagraphs = paragraphs
      .map(p => p.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim())
      .filter(p => p.length > 20)
      .slice(0, 20) // Limit to first 20 paragraphs
      .join(' ');

    const fullText = `${title}. ${description}. ${cleanParagraphs}`;
    return fullText.trim().substring(0, 10000); // Analysis limit
  } catch (e) {
    console.error("Failed to fetch URL content:", e);
    return null;
  }
}

// Batch analysis for multiple texts
function analyzeBatch(texts) {
  return texts.map((text, index) => ({
    index,
    text: (text || '').substring(0, 200) + ((text || '').length > 200 ? '...' : ''),
    ...analyzeSentiment(text),
  }));
}

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (isDisallowedOrigin(req)) {
    return new Response('Forbidden', { status: 403, headers: cors });
  }

  const rateLimitResult = await checkRateLimit(req, 'sentiment-analysis', 30, '60s');
  if (rateLimitResult) return rateLimitResult;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { text, texts, batch = false } = body;

    if (batch && Array.isArray(texts)) {
      // Batch analysis
      if (texts.length > 100) {
        return new Response(JSON.stringify({ error: 'Maximum 100 texts per batch' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      const results = analyzeBatch(texts);
      const summary = {
        total: results.length,
        positive: results.filter(r => r.sentiment === 'positive').length,
        negative: results.filter(r => r.sentiment === 'negative').length,
        neutral: results.filter(r => r.sentiment === 'neutral').length,
        averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
        averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
      };

      return new Response(JSON.stringify({ results, summary }), {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      });
    } else if (text) {
      // Single text analysis
      let contentToAnalyze = text;

      // Check if input is a URL
      const isUrl = /^https?:\/\/[^\s$.?#].[^\s]*$/i.test(text.trim());
      if (isUrl) {
        console.log('[sentiment/analyze] URL detected, fetching content:', text);
        const fetchedContent = await fetchUrlContent(text.trim());
        if (fetchedContent) {
          contentToAnalyze = fetchedContent;
        } else {
          console.warn('[sentiment/analyze] Failed to fetch URL content, analyzing URL string instead');
        }
      }

      const result = analyzeSentiment(contentToAnalyze);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      });
    } else {
      return new Response(JSON.stringify({ error: 'Text or texts array required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('[sentiment/analyze] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Sentiment analysis failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
