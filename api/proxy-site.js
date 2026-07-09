import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(req)) return new Response('Forbidden', { status: 403 });

  // Get target URL from query parameters
  const urlObj = new URL(req.url);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing target url query parameter', {
      status: 400,
      headers: { ...cors, 'Content-Type': 'text/plain' }
    });
  }

  try {
    // Validate target URL format
    const parsedUrl = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return new Response('Only http and https protocols are allowed', {
        status: 400,
        headers: { ...cors, 'Content-Type': 'text/plain' }
      });
    }

    // Fetch site landing page content on the server
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': MOBILE_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(12_000), // 12 second timeout
    });

    if (!response.ok) {
      return new Response(`Upstream responded with status ${response.status}`, {
        status: 502,
        headers: { ...cors, 'Content-Type': 'text/plain' }
      });
    }

    let html = await response.text();

    // Inject base href tag so relative links, images, CSS, and scripts resolve absolutely
    const baseTag = `<base href="${targetUrl}">`;
    
    // Insert base tag right after <head> or at the beginning of html
    if (html.toLowerCase().includes('<head>')) {
      html = html.replace(/<head>/i, `<head>${baseTag}`);
    } else if (html.toLowerCase().includes('<html>')) {
      html = html.replace(/<html>/i, `<html><head>${baseTag}</head>`);
    } else {
      html = baseTag + html;
    }

    // Return HTML to client. Note that since we return it from our own endpoint,
    // we do NOT forward the upstream X-Frame-Options or Content-Security-Policy headers.
    return new Response(html, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60', // cache for 1 minute
      }
    });

  } catch (err) {
    return new Response(`Proxy Error: ${err.message}`, {
      status: 500,
      headers: { ...cors, 'Content-Type': 'text/plain' }
    });
  }
}
