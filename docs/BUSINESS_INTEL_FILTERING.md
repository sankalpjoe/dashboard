# Business Intelligence Filtering Strategy

## Overview
The Company Intelligence feature implements strict filtering to ensure only high-quality, relevant business signals are surfaced. This document outlines the filtering criteria and rationale.

## 30-Day Time Window

All signals and news are filtered to **only the last 30 days**. This ensures:
- **Recency**: Only current, actionable intelligence
- **Relevance**: Avoid stale or outdated information
- **Signal Quality**: Recent events are more likely to be significant

### Implementation
```javascript
const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 86400);
// Applied to all HN API calls and GitHub repo queries
```

## C-Level Executive Filter

### Keywords Tracked
```javascript
const cLevelKeywords = [
  'CEO', 'CTO', 'CFO', 'COO', 'CMO', 'CPO', 'CISO',
  'Chief', 'founder', 'co-founder', 'president', 'executive'
];
```

### Why C-Level Focus?
- **Strategic Importance**: Executive movements signal major company changes
- **Market Impact**: C-level announcements often move markets
- **Decision Authority**: These individuals drive company direction
- **Investor Interest**: Executive changes are material events for investors

## Firm-Specific Event Filter

### Major Events Tracked
```javascript
const firmKeywords = [
  'announces', 'launches', 'raises', 'acquires', 'acquired',
  'funding', 'ipo', 'layoffs', 'expands', 'partnership', 'merger'
];
```

### Event Categories

#### 1. **Funding Events** (Critical Priority)
- Series A/B/C rounds
- Venture capital investments
- Valuation announcements
- Seed rounds

**Why**: Direct indicator of company growth and investor confidence

#### 2. **Executive Movements** (High Priority)
- New CEO/CTO/CFO appointments
- Founder departures
- Leadership promotions
- Board changes

**Why**: Leadership changes often precede strategic pivots

#### 3. **M&A Activity** (Critical Priority)
- Acquisitions
- Mergers
- Strategic partnerships
- Asset sales

**Why**: Fundamental changes to company structure and strategy

#### 4. **Product Launches** (Medium Priority)
- Major product announcements
- Platform launches
- Technology releases

**Why**: Indicates innovation and market positioning

#### 5. **Expansion Signals** (Medium Priority)
- New office openings
- Market entry
- International expansion
- Geographic growth

**Why**: Shows company scale and ambition

#### 6. **Financial Triggers** (High Priority)
- IPO announcements
- Quarterly earnings
- Revenue milestones
- Profitability changes

**Why**: Direct financial performance indicators

## Engagement Quality Filter

### Minimum Thresholds
```javascript
const hasEngagement = (h.points || 0) >= 10 || (h.num_comments || 0) >= 5;
```

### Why Engagement Matters
- **Community Validation**: High engagement = community finds it significant
- **Noise Reduction**: Filters out low-quality or spam posts
- **Relevance Proxy**: Popular posts are more likely to be important

### Engagement Scoring
```javascript
function scoreSignalStrength(points, comments, recencyDays) {
  let score = 0;
  
  // Points contribution
  if (points > 100) score += 3;
  else if (points > 30) score += 2;
  else score += 1;
  
  // Comments contribution
  if (comments > 50) score += 2;
  else if (comments > 10) score += 1;
  
  // Recency contribution
  if (recencyDays <= 3) score += 3;
  else if (recencyDays <= 7) score += 2;
  else if (recencyDays <= 14) score += 1;
  
  // Strength classification
  if (score >= 7) return 'critical';
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}
```

## Hiring Signal Detection

### Strict Hiring Filters
```javascript
const isOfficial = text.includes('we\'re hiring') || 
                   text.includes('join us') || 
                   text.includes('careers') ||
                   text.includes('open roles');
```

### Hiring Velocity Calculation
```javascript
const weeksInPeriod = 4; // 30 days ≈ 4 weeks
const hiringVelocity = hiringComments.length / weeksInPeriod;

// Strength classification
if (hiringVelocity >= 2) strength = 'critical'; // 2+ posts per week
else if (hiringVelocity >= 1) strength = 'high';
else if (hiringVelocity >= 0.5) strength = 'medium';
else strength = 'low';
```

### Why Hiring Velocity?
- **Growth Indicator**: Frequent hiring = rapid expansion
- **Trend Detection**: Acceleration or deceleration in hiring
- **Market Signal**: Hiring surge often precedes product launches

## GitHub Repository Signals

### Significance Criteria
```javascript
const isSignificant = r.stargazers_count > 50 || 
                     r.description?.toLowerCase().includes('official') ||
                     r.description?.toLowerCase().includes('product') ||
                     !r.fork;
```

### Why GitHub Matters
- **Technology Adoption**: New repos signal tech stack changes
- **Open Source Strategy**: Public repos indicate community engagement
- **Product Development**: Official repos often precede product launches

### Strength Classification
```javascript
if (r.stargazers_count > 100) strength = 'critical';
else if (r.stargazers_count > 50 || isSignificant) strength = 'high';
else if (r.stargazers_count > 10) strength = 'medium';
else strength = 'low';
```

## Relevance Scoring

### Multi-Factor Relevance
```javascript
function calculateRelevance(title, companyName) {
  let score = 0;
  
  // Exact company name match
  if (titleLower.includes(companyLower)) score += 10;
  
  // C-level mentions
  if (cLevelKeywords.some(k => titleLower.includes(k))) score += 5;
  
  // Major firm events
  if (majorEvents.some(e => titleLower.includes(e))) score += 3;
  
  return score;
}
```

### Sorting Priority
1. **Signal Strength** (critical > high > medium > low)
2. **Recency** (newer signals ranked higher within same strength)
3. **Relevance Score** (tiebreaker)

## Data Source Tiers

### Tier 1: Direct Sources
- Company official announcements
- SEC filings
- Press releases

### Tier 2: Community Validation
- Hacker News (high-quality tech community)
- GitHub (developer community)

### Tier 3: Aggregated Signals
- Hiring thread mentions
- Comment analysis
- Indirect references

## Result Limits

### API Response Limits
- **Hacker News Mentions**: Top 10 (from 50 fetched, filtered)
- **Signals**: Top 20 (from all sources, sorted by strength)
- **GitHub Repos**: All significant repos from last 30 days
- **Hiring Signals**: Aggregated into single velocity metric

### Why Limits?
- **UI Performance**: Prevent overwhelming the user
- **Quality Over Quantity**: Focus on most important signals
- **API Efficiency**: Reduce unnecessary data transfer

## False Positive Mitigation

### Company Name Matching
```javascript
// Must contain company name
if (!titleLower.includes(companyLower)) return false;
```

### Context Validation
- Not just mentions, but **about** the company
- Must be in title (not just comments)
- Must have engagement (community validation)

### Spam Filtering
- Minimum engagement thresholds
- Official source verification
- Duplicate detection

## Example Filtered Results

### ✅ Included Signals
- "Stripe appoints new CFO from Goldman Sachs" (C-level)
- "OpenAI raises $10B Series C at $80B valuation" (Funding)
- "Anthropic acquires AI safety startup" (M&A)
- "Vercel launches new edge runtime" (Product)
- "Databricks hiring 200+ engineers this quarter" (Hiring surge)

### ❌ Excluded Signals
- "I used Stripe for my side project" (Not about firm)
- "Stripe API documentation is great" (Not a signal)
- "Old article: Stripe founded in 2010" (>30 days)
- "Someone mentioned Stripe in comments" (Low engagement)
- "Stripe competitor launches" (Not about the searched company)

## Performance Considerations

### Caching Strategy
```javascript
// Company enrichment: 1 hour cache
staleTime: 3600_000

// Signals: 30 minute cache
staleTime: 1800_000
```

### API Rate Limits
- **Company Enrichment**: 30 requests/60s
- **Signals**: 20 requests/60s

### Batch Processing
- All sources fetched in parallel
- Timeout per source: 5 seconds
- Graceful degradation if source fails

## Future Enhancements

### Planned Improvements
1. **Sentiment Analysis**: Classify signals as positive/negative/neutral
2. **Entity Extraction**: Identify specific executives, products, locations
3. **Trend Detection**: Multi-week trend analysis
4. **Competitive Intelligence**: Track competitor signals
5. **Alert System**: Real-time notifications for critical signals

### Additional Data Sources
- LinkedIn company updates
- Crunchbase funding data
- Patent filings
- Conference speaking engagements
- Twitter/X executive accounts

## Testing Strategy

### Unit Tests
- Keyword matching accuracy
- Date filtering correctness
- Engagement scoring logic
- Relevance calculation

### Integration Tests
- End-to-end signal discovery
- Multi-source aggregation
- Cache behavior
- Rate limiting

### Quality Metrics
- **Precision**: % of returned signals that are relevant
- **Recall**: % of relevant signals that are returned
- **Latency**: Time to fetch and filter signals
- **Cache Hit Rate**: % of requests served from cache

## Monitoring

### Key Metrics
- Signals per company (average)
- Filter rejection rate
- API response times
- Cache effectiveness
- User engagement with signals

### Alerts
- High filter rejection rate (>80%)
- API timeout rate (>10%)
- Cache miss rate (>50%)
- Zero signals for popular companies

## Conclusion

The strict filtering strategy ensures that only **high-quality, recent, and relevant** business intelligence is surfaced. By focusing on C-level executives and major firm events within a 30-day window, we provide actionable insights that matter to investors, analysts, and business professionals.

The multi-layered filtering approach balances **precision** (avoiding false positives) with **recall** (capturing important signals), while maintaining excellent **performance** through intelligent caching and parallel processing.
