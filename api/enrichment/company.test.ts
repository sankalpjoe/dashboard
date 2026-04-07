import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('../_cors.js', () => ({
  getCorsHeaders: vi.fn(() => ({ 'Access-Control-Allow-Origin': '*' })),
  isDisallowedOrigin: vi.fn(() => false),
}));

vi.mock('../_rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => null),
}));

describe('Company Enrichment API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('GitHub Integration', () => {
    it('should fetch GitHub org data successfully', async () => {
      const mockGitHubResponse = {
        name: 'Stripe',
        login: 'stripe',
        description: 'Online payment processing',
        blog: 'https://stripe.com',
        location: 'San Francisco, CA',
        public_repos: 150,
        followers: 5000,
        avatar_url: 'https://avatars.githubusercontent.com/u/856813',
        created_at: '2011-05-01T00:00:00Z',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockGitHubResponse,
      });

      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company?domain=stripe.com');
      const response = await handler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.company.name).toBe('Stripe');
      expect(data.github).toBeDefined();
      expect(data.github.publicRepos).toBe(150);
    });

    it('should handle GitHub API failures gracefully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company?domain=unknown.com');
      const response = await handler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.github).toBeNull();
      expect(data.sources).not.toContain('github');
    });
  });

  describe('Tech Stack Inference', () => {
    it('should infer tech stack from GitHub repos', async () => {
      const mockReposResponse = [
        { language: 'TypeScript', stargazers_count: 1000 },
        { language: 'Python', stargazers_count: 500 },
        { language: 'TypeScript', stargazers_count: 300 },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({ ok: false }) // GitHub org fails
        .mockResolvedValueOnce({ ok: true, json: async () => mockReposResponse });

      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company?name=TestCompany');
      const response = await handler(request);
      const data = await response.json();

      expect(data.techStack).toBeDefined();
      expect(data.techStack[0].name).toBe('TypeScript');
      expect(data.techStack[0].category).toBe('Programming Language');
    });
  });

  describe('SEC Filings', () => {
    it('should fetch SEC filings for public companies', async () => {
      const mockSECResponse = {
        hits: {
          total: { value: 10 },
          hits: [
            {
              _source: {
                form_type: '10-K',
                file_date: '2024-01-15',
                display_names: ['Test Corp'],
              },
            },
          ],
        },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({ ok: false }) // GitHub org
        .mockResolvedValueOnce({ ok: false }) // GitHub repos
        .mockResolvedValueOnce({ ok: true, json: async () => mockSECResponse });

      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company?name=TestCorp');
      const response = await handler(request);
      const data = await response.json();

      expect(data.secFilings).toBeDefined();
      expect(data.secFilings.totalFilings).toBe(10);
      expect(data.secFilings.recentFilings[0].form).toBe('10-K');
    });
  });

  describe('Hacker News Mentions', () => {
    it('should fetch HN mentions', async () => {
      const mockHNResponse = {
        hits: [
          {
            title: 'Stripe launches new product',
            url: 'https://stripe.com/blog/new-product',
            points: 250,
            num_comments: 45,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      };

      (global.fetch as any)
        .mockResolvedValueOnce({ ok: false }) // GitHub org
        .mockResolvedValueOnce({ ok: false }) // GitHub repos
        .mockResolvedValueOnce({ ok: false }) // SEC
        .mockResolvedValueOnce({ ok: true, json: async () => mockHNResponse });

      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company?name=Stripe');
      const response = await handler(request);
      const data = await response.json();

      expect(data.hackerNewsMentions).toBeDefined();
      expect(data.hackerNewsMentions[0].title).toBe('Stripe launches new product');
      expect(data.hackerNewsMentions[0].points).toBe(250);
    });
  });

  describe('Input Validation', () => {
    it('should require domain or name parameter', async () => {
      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company');
      const response = await handler(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('domain');
    });

    it('should infer company name from domain', async () => {
      (global.fetch as any)
        .mockResolvedValue({ ok: false });

      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company?domain=stripe.com');
      const response = await handler(request);
      const data = await response.json();

      expect(data.company.name).toBe('Stripe');
      expect(data.company.domain).toBe('stripe.com');
    });
  });

  describe('CORS and Rate Limiting', () => {
    it('should handle OPTIONS preflight requests', async () => {
      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company', {
        method: 'OPTIONS',
      });
      const response = await handler(request);

      expect(response.status).toBe(204);
    });

    it('should block disallowed origins', async () => {
      const { isDisallowedOrigin } = await import('../_cors.js');
      (isDisallowedOrigin as any).mockReturnValueOnce(true);

      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company?domain=test.com');
      const response = await handler(request);

      expect(response.status).toBe(403);
    });

    it('should enforce rate limits', async () => {
      const { checkRateLimit } = await import('../_rate-limit.js');
      (checkRateLimit as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 })
      );

      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company?domain=test.com');
      const response = await handler(request);

      expect(response.status).toBe(429);
    });
  });

  describe('Cache Headers', () => {
    it('should set appropriate cache headers', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false });

      const handler = (await import('./company.js')).default;
      const request = new Request('http://localhost/api/enrichment/company?domain=test.com');
      const response = await handler(request);

      const cacheControl = response.headers.get('Cache-Control');
      expect(cacheControl).toContain('s-maxage');
      expect(cacheControl).toContain('stale-while-revalidate');
    });
  });
});
