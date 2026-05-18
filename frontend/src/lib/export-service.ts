import type { NewsItem } from './news-service';

// Email configuration
const EMAIL_CONFIG = {
  serviceId: 'service_12345',
  templateId: 'template_12345',
  publicKey: 'user_12345',
  // These would be configured via environment variables in production
  recipientEmail: 'intel@example.com', // Default recipient
  senderEmail: 'dashint@example.com',
  senderName: 'DashINT Intelligence System'
};

// Type declarations for external libraries
interface EmailJS {
  send: (serviceId: string, templateId: string, templateParams: Record<string, unknown>, publicKey: string) => Promise<void>;
}

interface WindowWithEmailJS extends Window {
  emailjs?: EmailJS;
}

// Groq LLM configuration for summary generation
const GROQ_KEY = (import.meta as ImportMeta).env?.VITE_GROQ_API_KEY as string | undefined;
const GROQ_MODEL = ((import.meta as ImportMeta).env?.VITE_GROQ_MODEL as string | undefined) ?? 'llama-3.3-70b-versatile';

// Generate concise summary using Groq LLM
export async function generateEventSummary(newsItems: NewsItem[]): Promise<string> {
  if (!GROQ_KEY) {
    console.warn('Groq API key not configured. Using fallback summary generation.');
    return generateFallbackSummary(newsItems);
  }

  try {
    // Filter for high-quality, relevant items
    const relevantItems = newsItems
      .filter(item => item.relevanceScore && item.relevanceScore >= 5)
      .filter(item => item.groqVetted !== false) // Keep items that are vetted or not yet vetted
      .slice(0, 10); // Limit to top 10 items for token efficiency

    if (relevantItems.length === 0) {
      return "No significant events detected in the current monitoring period.";
    }

    // Prepare context for Groq
    const context = relevantItems.map(item => {
      const category = item.refinedCategory || item.category;
      const kannadaFlag = item.isKannadaSource ? '[KANNADA SOURCE] ' : '';
      const qualityScore = item.groqQualityScore ? `[Quality: ${item.groqQualityScore}/10] ` : '';
      return `${kannadaFlag}${qualityScore}[${category.toUpperCase()}] ${item.headline} — ${item.source} (${item.city || 'India'}, ${item.time})`;
    }).join('\n');

    const systemPrompt = `You are an intelligence analyst for DashINT World Monitor. Generate a concise executive summary of key events from the following intelligence signals.

IMPORTANT GUIDELINES:
1. Focus on events from refined monitoring categories: War & Armed Conflict, Terrorism, Embassy Security Alerts, Civil Unrest & Logistics, Transit Disruptions, Climate & Natural Disasters, Disease Outbreaks
2. Highlight Kannada vernacular sources when present
3. Prioritize high-quality signals (quality score 7+)
4. Structure summary with:
   - Executive overview (1-2 sentences)
   - Key events by category (bullet points)
   - Regional focus (especially India/Karnataka)
   - Immediate concerns
5. Keep total length under 300 words
6. Use professional intelligence terminology
7. Include timestamps and locations where relevant

INTELLIGENCE SIGNALS:
${context}

Generate the executive summary:`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate executive summary of key events' }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || generateFallbackSummary(newsItems);
  } catch (error) {
    console.error('Error generating summary with Groq:', error);
    return generateFallbackSummary(newsItems);
  }
}

// Fallback summary generation when Groq is unavailable
function generateFallbackSummary(newsItems: NewsItem[]): string {
  const relevantItems = newsItems
    .filter(item => item.relevanceScore && item.relevanceScore >= 5)
    .slice(0, 10);

  if (relevantItems.length === 0) {
    return "No significant events detected in the current monitoring period.";
  }

  // Group by refined category
  const byCategory: Record<string, NewsItem[]> = {};
  relevantItems.forEach(item => {
    const category = item.refinedCategory || item.category;
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(item);
  });

  const summaryParts: string[] = [];
  summaryParts.push('EXECUTIVE SUMMARY - DASHINT WORLD MONITOR');
  summaryParts.push(`Generated: ${new Date().toLocaleString()}`);
  summaryParts.push(`Total signals processed: ${newsItems.length}`);
  summaryParts.push(`High-relevance signals: ${relevantItems.length}`);
  summaryParts.push('');

  // Add Kannada source count
  const kannadaSources = relevantItems.filter(item => item.isKannadaSource).length;
  if (kannadaSources > 0) {
    summaryParts.push(`Kannada vernacular sources: ${kannadaSources} signals`);
    summaryParts.push('');
  }

  // Add events by category
  Object.entries(byCategory).forEach(([category, items]) => {
    summaryParts.push(`${category.toUpperCase()}:`);
    items.forEach(item => {
      const kannadaFlag = item.isKannadaSource ? '[KN] ' : '';
      const qualityScore = item.groqQualityScore ? ` (Quality: ${item.groqQualityScore}/10)` : '';
      summaryParts.push(`  • ${kannadaFlag}${item.headline} — ${item.source}${qualityScore}`);
    });
    summaryParts.push('');
  });

  // Add immediate concerns
  const highSeverity = relevantItems.filter(item => item.severity <= 2);
  if (highSeverity.length > 0) {
    summaryParts.push('IMMEDIATE CONCERNS:');
    highSeverity.forEach(item => {
      summaryParts.push(`  • ${item.headline} (${item.city || 'Location unknown'})`);
    });
  }

  return summaryParts.join('\n');
}

// Send email via backend API (Resend/SendGrid/SMTP)
export async function sendEmailSummary(
  summary: string,
  recipientEmail?: string,
  subject?: string,
  format: 'markdown' | 'pdf' = 'markdown'
): Promise<boolean> {
  try {
    const response = await fetch('/api/email-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipientEmail: recipientEmail || EMAIL_CONFIG.recipientEmail,
        summary: summary,
        subject: subject || `DashINT Intelligence Summary - ${new Date().toLocaleDateString()}`,
        format: format
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Email API error:', errorData);
      return false;
    }

    const result = await response.json();
    return result.success === true;
    
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Export data in various formats
export function exportToCsv(newsItems: NewsItem[]): string {
  const headers = [
    'ID',
    'Headline',
    'Source',
    'Time',
    'Category',
    'Refined Category',
    'Severity',
    'Confidence',
    'City',
    'Language',
    'Kannada Source',
    'Kannada Confidence',
    'Groq Vetted',
    'Groq Quality Score',
    'Relevance Score',
    'Sentiment',
    'URL'
  ];

  const rows = newsItems.map(item => [
    item.id,
    `"${item.headline.replace(/"/g, '""')}"`,
    item.source,
    item.time,
    item.category,
    item.refinedCategory || '',
    item.severity,
    item.confidence,
    item.city || '',
    item.lang || '',
    item.isKannadaSource ? 'Yes' : 'No',
    item.kannadaConfidence || 0,
    item.groqVetted ? 'Yes' : 'No',
    item.groqQualityScore || '',
    item.relevanceScore || '',
    item.sentiment || '',
    item.url || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
}

export function exportToJson(newsItems: NewsItem[]): string {
  const exportData = newsItems.map(item => ({
    id: item.id,
    headline: item.headline,
    source: item.source,
    time: item.time,
    timestamp: item.timestamp,
    category: item.category,
    refinedCategory: item.refinedCategory,
    severity: item.severity,
    confidence: item.confidence,
    city: item.city,
    lang: item.lang,
    langLabel: item.langLabel,
    isKannadaSource: item.isKannadaSource,
    kannadaConfidence: item.kannadaConfidence,
    groqVetted: item.groqVetted,
    groqQualityScore: item.groqQualityScore,
    groqRejectionReason: item.groqRejectionReason,
    relevanceScore: item.relevanceScore,
    sentiment: item.sentiment,
    summary: item.summary,
    url: item.url,
    lat: item.lat,
    lon: item.lon
  }));

  return JSON.stringify(exportData, null, 2);
}

// Main export function that provides all options
export async function exportIntelligenceData(
  newsItems: NewsItem[],
  format: 'csv' | 'json' | 'email' | 'pdf' = 'csv',
  emailRecipient?: string,
  emailFormat: 'markdown' | 'pdf' = 'markdown'
): Promise<{
  success: boolean;
  data?: string;
  message: string;
}> {
  try {
    if (format === 'csv') {
      const csvData = exportToCsv(newsItems);
      return {
        success: true,
        data: csvData,
        message: `Exported ${newsItems.length} items to CSV format`
      };
    } else if (format === 'json') {
      const jsonData = exportToJson(newsItems);
      return {
        success: true,
        data: jsonData,
        message: `Exported ${newsItems.length} items to JSON format`
      };
    } else if (format === 'email' || format === 'pdf') {
      // Generate summary first
      const summary = await generateEventSummary(newsItems);
      
      // Determine the email format
      const actualEmailFormat = format === 'pdf' ? 'pdf' : emailFormat;
      
      // Send email
      const emailSuccess = await sendEmailSummary(
        summary,
        emailRecipient,
        `DashINT Intelligence ${format === 'pdf' ? 'PDF Report' : 'Summary'} - ${new Date().toLocaleDateString()}`,
        actualEmailFormat
      );

      if (emailSuccess) {
        return {
          success: true,
          data: summary,
          message: `${format === 'pdf' ? 'PDF report' : 'Email summary'} sent successfully to ${emailRecipient || EMAIL_CONFIG.recipientEmail}`
        };
      } else {
        return {
          success: false,
          message: `Failed to send ${format === 'pdf' ? 'PDF report' : 'email summary'}`
        };
      }
    } else {
      return {
        success: false,
        message: `Unsupported export format: ${format}`
      };
    }
  } catch (error) {
    console.error('Export error:', error);
    return {
      success: false,
      message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}