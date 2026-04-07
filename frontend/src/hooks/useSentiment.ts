import { useMutation } from "@tanstack/react-query";
import { ofetch } from "ofetch";

export interface SentimentResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number; // -1 to +1
  confidence: number; // 0 to 100
  breakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
  details?: {
    totalWords: number;
    sentimentWords: number;
    positiveKeywords: number;
    negativeKeywords: number;
  };
}

export interface BatchSentimentResult {
  results: Array<SentimentResult & { index: number; text: string }>;
  summary: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    averageScore: number;
    averageConfidence: number;
  };
}

export function useSentimentAnalysis() {
  return useMutation({
    mutationFn: async (text: string) => {
      return ofetch<SentimentResult>("/api/sentiment/analyze", {
        method: "POST",
        body: { text },
      });
    },
  });
}

export function useBatchSentimentAnalysis() {
  return useMutation({
    mutationFn: async (texts: string[]) => {
      return ofetch<BatchSentimentResult>("/api/sentiment/analyze", {
        method: "POST",
        body: { texts, batch: true },
      });
    },
  });
}

// Helper function to get sentiment color
export function getSentimentColor(sentiment: string): string {
  switch (sentiment) {
    case 'positive':
      return 'text-green-500';
    case 'negative':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

// Helper function to get sentiment badge variant
export function getSentimentBadge(sentiment: string): 'default' | 'destructive' | 'secondary' {
  switch (sentiment) {
    case 'positive':
      return 'default';
    case 'negative':
      return 'destructive';
    default:
      return 'secondary';
  }
}

// Helper function to get sentiment emoji
export function getSentimentEmoji(sentiment: string): string {
  switch (sentiment) {
    case 'positive':
      return '😊';
    case 'negative':
      return '😟';
    default:
      return '😐';
  }
}
