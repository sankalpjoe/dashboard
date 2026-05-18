export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUMMARY_LENGTH = 10000;
const MAX_SUBJECT_LENGTH = 200;

const rateLimitMap = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

async function sendIntelligenceReportEmail(recipientEmail, subject, summary, format = 'markdown') {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('[email-report] RESEND_API_KEY not set — email cannot be sent');
    return false;
  }

  const senderEmail = process.env.EMAIL_SENDER || 'noreply@worldmonitor.app';
  const senderName = process.env.EMAIL_SENDER_NAME || 'DashINT Intelligence System';

  try {
    // Format the email content based on the requested format
    let emailContent;
    if (format === 'pdf') {
      // For PDF, we'll send a link to download or attach as PDF
      // For now, we'll include the content in the email with PDF styling
      emailContent = `
        <div style="font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; background: #f8f9fa; padding: 30px; border-radius: 8px;">
          <div style="background: white; padding: 30px; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="border-bottom: 2px solid #4ade80; padding-bottom: 15px; margin-bottom: 25px;">
              <h1 style="color: #1a1b26; margin: 0; font-size: 24px;">DASHINT INTELLIGENCE REPORT</h1>
              <p style="color: #666; margin: 5px 0 0; font-size: 14px;">Generated: ${new Date().toLocaleString()}</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 4px; margin-bottom: 25px; border-left: 4px solid #4ade80;">
              <h2 style="color: #1a1b26; margin-top: 0; font-size: 18px;">EXECUTIVE SUMMARY</h2>
              <div style="white-space: pre-wrap; font-family: 'Courier New', monospace; background: white; padding: 15px; border-radius: 4px; border: 1px solid #e9ecef;">
                ${escapeHtml(summary)}
              </div>
            </div>
            
            <div style="color: #666; font-size: 12px; border-top: 1px solid #e9ecef; padding-top: 20px; margin-top: 30px;">
              <p>This is an automated intelligence report from DashINT World Monitor.</p>
              <p>Classification: RESTRICTED - For authorized recipients only.</p>
              <p>Report ID: ${generateReportId()}</p>
            </div>
          </div>
        </div>
      `;
    } else {
      // Markdown format (default)
      emailContent = `
        <div style="font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1a1b26 0%, #2d2e3f 100%); color: white; padding: 25px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 600;">DASHINT INTELLIGENCE REPORT</h1>
            <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${subject}</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 25px; border-left: 4px solid #4ade80;">
              <h2 style="color: #1a1b26; margin-top: 0; font-size: 18px; font-weight: 600;">INTELLIGENCE SUMMARY</h2>
              <div style="white-space: pre-wrap; font-family: 'IBM Plex Mono', monospace; font-size: 13px; line-height: 1.6; color: #2d3748; background: white; padding: 20px; border-radius: 4px; border: 1px solid #e2e8f0;">
                ${escapeHtml(summary)}
              </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 20px; border-top: 1px solid #e2e8f0; margin-top: 30px;">
              <div style="color: #718096; font-size: 12px;">
                <p>Generated: ${new Date().toLocaleString()}</p>
                <p>Report ID: ${generateReportId()}</p>
              </div>
              <div style="background: #4ade80; color: white; padding: 8px 16px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                CLASSIFIED: RESTRICTED
              </div>
            </div>
          </div>
          
          <div style="color: #a0aec0; font-size: 11px; text-align: center; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p>This is an automated report from DashINT World Monitor Intelligence System.</p>
            <p>Unauthorized distribution prohibited. For authorized recipients only.</p>
          </div>
        </div>
      `;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [recipientEmail],
        subject: subject,
        html: emailContent,
        attachments: format === 'pdf' ? [
          {
            filename: `dashint-report-${new Date().toISOString().split('T')[0]}.txt`,
            content: Buffer.from(summary).toString('base64'),
          }
        ] : [],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email-report] Resend ${res.status}:`, body);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[email-report] Resend error:', err);
    return false;
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateReportId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `DASHINT-${timestamp}-${random}`.toUpperCase();
}

function sanitizeSubject(str) {
  return str.replace(/[\r\n\0]/g, '').slice(0, MAX_SUBJECT_LENGTH);
}

export default async function handler(req) {
  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cors = getCorsHeaders(req, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  try {
    const body = await req.json();
    
    // Validate required fields
    const { recipientEmail, summary, subject, format = 'markdown' } = body;
    
    if (!recipientEmail || typeof recipientEmail !== 'string' || !EMAIL_RE.test(recipientEmail)) {
      return new Response(JSON.stringify({ error: 'Valid recipient email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
    
    if (!summary || typeof summary !== 'string' || summary.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Summary content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
    
    if (summary.length > MAX_SUMMARY_LENGTH) {
      return new Response(JSON.stringify({ error: `Summary exceeds maximum length of ${MAX_SUMMARY_LENGTH} characters` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
    
    const sanitizedSubject = subject 
      ? sanitizeSubject(subject)
      : `DashINT Intelligence Report - ${new Date().toLocaleDateString()}`;
    
    // Send the email
    const emailSent = await sendIntelligenceReportEmail(
      recipientEmail,
      sanitizedSubject,
      summary.trim(),
      format
    );
    
    if (emailSent) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Intelligence report sent successfully',
        reportId: generateReportId(),
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to send email report' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
    
  } catch (error) {
    console.error('[email-report] Handler error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
}