# API_ALT Integration Plan

## Overview
The `api_alt` folder contains an enhanced API architecture with new features and categories that should be integrated into the main API stack. This document outlines the integration strategy.

## New Features in api_alt

### 1. **Company Enrichment APIs** (NEW)
Located in `api_alt/enrichment/`

#### `/api/enrichment/company`
- Aggregates company data from multiple sources:
  - GitHub org data & tech stack inference
  - Hacker News mentions
  - SEC EDGAR filings (US public companies)
- **Use Case**: Tech variant company intelligence, startup tracking
- **Rate Limit**: 30 requests/60s

#### `/api/enrichment/signals`
- Discovers activity signals for companies:
  - Hiring surge detection
  - Funding events
  - Executive movements
  - Technology adoption
  - Financial triggers
- **Use Case**: Early warning system for company changes
- **Rate Limit**: 20 requests/60s

### 2. **Satellite Tracking** (NEW)
`/api/satellites`
- TLE (Two-Line Element) data for satellite tracking
- Redis-backed with 10-minute cache
- **Use Case**: Space infrastructure monitoring, satellite constellation tracking

### 3. **Reverse Geocoding** (NEW)
`/api/reverse-geocode`
- Converts lat/lon to country/location names
- Uses Nominatim (OpenStreetMap)
- Redis cache with 7-day TTL
- **Use Case**: Event location enrichment, map marker labels

### 4. **Contact/Lead Management** (NEW)
`/api/contact`
- Enterprise contact form with:
  - Turnstile bot protection
  - Convex database storage
  - Resend email notifications
  - Rate limiting (3 requests/hour per IP)
- **Use Case**: Enterprise sales pipeline

### 5. **Health Monitoring** (ENHANCED)
`/api/health`
- Comprehensive system health checks:
  - 40+ data source checks
  - Seed freshness tracking
  - Cascade fallback detection
  - Compact mode for monitoring dashboards
- **Status Levels**: HEALTHY, WARNING, DEGRADED, UNHEALTHY

### 6. **Seed Health** (NEW)
`/api/seed-health`
- Detailed seed job monitoring
- Per-source freshness tracking
- Stale data detection

### 7. **Imagery Service** (NEW)
`/api/imagery/v1/[rpc]`
- Satellite imagery integration
- Proto-based RPC gateway
- **Use Case**: Visual intelligence layer

### 8. **Natural Events Service** (NEW)
`/api/natural/v1/[rpc]`
- Natural disaster aggregation beyond seismology
- Floods, landslides, volcanic activity
- **Use Case**: Comprehensive disaster monitoring

### 9. **Relay Architecture** (NEW)
`_relay.js` - Unified proxy pattern
- Shared secret authentication
- Timeout handling
- Fallback support
- Used by: AIS, OpenSky, OREF, Polymarket

## Integration Strategy

### Phase 1: Core Infrastructure (Week 1)
1. **Copy shared utilities**
   - `api_alt/_relay.js` → `api/_relay.js`
   - Update `api/_cors.js` with any new domains
   - Merge `api_alt/_rss-allowed-domains.js` into main

2. **Update environment variables**
   ```env
   # New variables needed
   TURNSTILE_SECRET_KEY=xxx
   RESEND_API_KEY=xxx
   CONTACT_NOTIFY_EMAIL=sales@worldmonitor.app
   RELAY_SHARED_SECRET=xxx
   RELAY_AUTH_HEADER=x-relay-key
   ```

### Phase 2: New Endpoints (Week 2)
1. **Enrichment APIs**
   - Copy `api_alt/enrichment/` → `api/enrichment/`
   - Add to Vite dev server proxy config
   - Create frontend hooks in `frontend/src/hooks/useCompanyEnrichment.ts`

2. **Utility Endpoints**
   - Copy `api_alt/satellites.js` → `api/satellites.js`
   - Copy `api_alt/reverse-geocode.js` → `api/reverse-geocode.js`
   - Copy `api_alt/contact.js` → `api/contact.js`

3. **Health Monitoring**
   - Replace `api/health.js` with `api_alt/health.js` (enhanced version)
   - Add `api_alt/seed-health.js` → `api/seed-health.js`

### Phase 3: New Services (Week 3)
1. **Imagery Service**
   - Copy `api_alt/imagery/` → `api/imagery/`
   - Create proto definitions in `proto/worldmonitor/imagery/v1/`
   - Generate server/client code
   - Implement handler in `server/worldmonitor/imagery/v1/handler.ts`

2. **Natural Events Service**
   - Copy `api_alt/natural/` → `api/natural/`
   - Create proto definitions
   - Implement aggregation logic

### Phase 4: Frontend Integration (Week 4)
1. **Company Intelligence Panel** (Tech variant)
   ```tsx
   // frontend/src/components/panels/CompanyIntelligence.tsx
   - Company search with enrichment
   - Signal timeline visualization
   - Tech stack badges
   - HN mention feed
   ```

2. **Satellite Tracking Layer** (Map)
   ```tsx
   // Add to map layers
   - Satellite constellation visualization
   - TLE orbit prediction
   - Coverage area rendering
   ```

3. **Enhanced Geocoding**
   - Replace existing geocoding with reverse-geocode API
   - Add location labels to all map markers

4. **Contact Form** (Enterprise page)
   ```tsx
   // frontend/src/pages/Enterprise.tsx
   - Turnstile integration
   - Form validation with Zod
   - Success/error states
   ```

## File Migration Checklist

### Copy As-Is
- [ ] `api_alt/_relay.js` → `api/_relay.js`
- [ ] `api_alt/enrichment/company.js` → `api/enrichment/company.js`
- [ ] `api_alt/enrichment/signals.js` → `api/enrichment/signals.js`
- [ ] `api_alt/satellites.js` → `api/satellites.js`
- [ ] `api_alt/reverse-geocode.js` → `api/reverse-geocode.js`
- [ ] `api_alt/contact.js` → `api/contact.js`
- [ ] `api_alt/seed-health.js` → `api/seed-health.js`

### Replace Existing
- [ ] `api/health.js` ← `api_alt/health.js` (enhanced version)

### Requires Proto Generation
- [ ] `api_alt/imagery/v1/[rpc].ts` (need proto first)
- [ ] `api_alt/natural/v1/[rpc].ts` (need proto first)

### Merge/Update
- [ ] Merge `api_alt/_rss-allowed-domains.js` into `api/_cors.js`
- [ ] Update relay handlers: `api/ais-snapshot.js`, `api/opensky.js`, etc.

## Database Schema Updates

### Convex Schema Addition
```typescript
// convex/schema.ts
export default defineSchema({
  // ... existing tables
  
  contactMessages: defineTable({
    name: v.string(),
    email: v.string(),
    organization: v.optional(v.string()),
    message: v.optional(v.string()),
    source: v.string(),
    submittedAt: v.number(),
    status: v.optional(v.string()), // 'new', 'contacted', 'qualified', 'closed'
  }).index('by_email', ['email'])
    .index('by_submitted', ['submittedAt']),
});
```

### Redis Keys Addition
```javascript
// New keys used by api_alt
'intelligence:satellites:tle:v1'
'geocode:{lat},{lon}' // reverse geocode cache
'seed-meta:*' // freshness tracking for all sources
```

## Vite Dev Server Updates

```typescript
// vite.config.ts - Add to sebufApiPlugin
function enrichmentApiPlugin(): Plugin {
  return {
    name: 'enrichment-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/enrichment/')) return next();
        
        // Proxy to enrichment handlers
        const { default: handler } = await import(
          req.url.includes('/company') 
            ? './api/enrichment/company.js'
            : './api/enrichment/signals.js'
        );
        
        // Convert to Web Request and execute
        // ... (similar to existing sebufApiPlugin pattern)
      });
    },
  };
}
```

## Frontend Components to Create

### 1. Company Enrichment Hook
```typescript
// frontend/src/hooks/useCompanyEnrichment.ts
export function useCompanyEnrichment(domain: string) {
  return useQuery({
    queryKey: ['company-enrichment', domain],
    queryFn: () => fetch(`/api/enrichment/company?domain=${domain}`).then(r => r.json()),
    staleTime: 3600_000, // 1 hour
  });
}
```

### 2. Satellite Layer Component
```typescript
// frontend/src/components/map/SatelliteLayer.tsx
export function SatelliteLayer() {
  const { data } = useQuery({
    queryKey: ['satellites'],
    queryFn: () => fetch('/api/satellites').then(r => r.json()),
    refetchInterval: 600_000, // 10 minutes
  });
  
  // Render satellite positions on deck.gl
}
```

### 3. Contact Form Component
```typescript
// frontend/src/components/forms/ContactForm.tsx
import { Turnstile } from '@marsidev/react-turnstile';

export function ContactForm() {
  const [token, setToken] = useState('');
  
  const mutation = useMutation({
    mutationFn: (data) => fetch('/api/contact', {
      method: 'POST',
      body: JSON.stringify({ ...data, turnstileToken: token }),
    }),
  });
  
  // Form with Turnstile widget
}
```

## Testing Plan

### Unit Tests
- [ ] `api/enrichment/company.test.ts` - Mock GitHub/SEC/HN APIs
- [ ] `api/enrichment/signals.test.ts` - Signal classification logic
- [ ] `api/reverse-geocode.test.ts` - Nominatim integration
- [ ] `api/_relay.test.ts` - Relay handler factory

### Integration Tests
- [ ] E2E test for contact form submission
- [ ] Satellite data fetch and render
- [ ] Company enrichment panel workflow
- [ ] Health endpoint monitoring

### Load Tests
- [ ] Rate limiting on enrichment APIs
- [ ] Redis cache hit rates
- [ ] Relay timeout handling

## Monitoring & Alerts

### New Datadog Monitors
1. **Enrichment API Errors**
   - Alert if error rate > 5% over 5 minutes
   
2. **Satellite Data Staleness**
   - Alert if data age > 30 minutes
   
3. **Contact Form Failures**
   - Alert on any Resend API failures
   
4. **Health Check Degradation**
   - Alert if status != HEALTHY for > 10 minutes

## Documentation Updates

- [ ] Update `docs/API_REFERENCE.md` with new endpoints
- [ ] Add enrichment API examples to `docs/EXAMPLES.md`
- [ ] Document relay pattern in `docs/ARCHITECTURE.md`
- [ ] Update OpenAPI specs for new services

## Rollout Plan

### Week 1: Infrastructure
- Deploy relay utilities
- Update environment variables
- Test health monitoring

### Week 2: Enrichment APIs
- Deploy company/signals endpoints
- Add rate limiting
- Monitor usage

### Week 3: Satellite & Geocoding
- Deploy utility endpoints
- Integrate with map layers
- Performance testing

### Week 4: Frontend Integration
- Company intelligence panel (Tech variant)
- Satellite visualization
- Contact form
- Full E2E testing

### Week 5: Production Rollout
- Gradual rollout with feature flags
- Monitor error rates
- Gather user feedback
- Iterate based on metrics

## Success Metrics

- **Enrichment API**: 1000+ requests/day within 2 weeks
- **Satellite Layer**: 50%+ of users enable it
- **Contact Form**: 10+ qualified leads/month
- **Health Monitoring**: 99.9% uptime detection accuracy
- **Reverse Geocoding**: <100ms p95 latency

## Risk Mitigation

1. **Third-party API failures**
   - Implement circuit breakers
   - Graceful degradation
   - Fallback to cached data

2. **Rate limit exhaustion**
   - Monitor quota usage
   - Implement backoff strategies
   - User-facing rate limit messaging

3. **Data staleness**
   - Seed health monitoring
   - Automatic retry logic
   - User notifications for stale data

4. **Security concerns**
   - API key validation on all endpoints
   - CORS strict allowlisting
   - Input sanitization
   - Bot protection (Turnstile)
