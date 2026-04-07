import { useState } from "react";
import { Smile, Frown, Meh, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useSentimentAnalysis, getSentimentColor, getSentimentEmoji } from "@/hooks/useSentiment";

export function SentimentPanel() {
  const [text, setText] = useState("");
  const sentiment = useSentimentAnalysis();

  const handleAnalyze = () => {
    if (!text.trim()) {
      alert("Please enter some text to analyze");
      return;
    }
    sentiment.mutate(text);
  };

  const getSentimentIcon = (sentimentType: string) => {
    switch (sentimentType) {
      case 'positive':
        return <Smile className="h-5 w-5 text-green-500" />;
      case 'negative':
        return <Frown className="h-5 w-5 text-red-500" />;
      default:
        return <Meh className="h-5 w-5 text-gray-500" />;
    }
  };

  const getSentimentBadgeVariant = (sentimentType: string): "default" | "destructive" | "secondary" => {
    switch (sentimentType) {
      case 'positive':
        return 'default';
      case 'negative':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Sentiment Analysis
        </CardTitle>
        <CardDescription>
          Analyze text for positive, negative, or neutral sentiment
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input */}
        <div className="space-y-3">
          <Textarea
            placeholder="Enter news article, social media post, or any text to analyze sentiment..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {text.length} characters
            </span>
            <Button 
              onClick={handleAnalyze} 
              disabled={sentiment.isPending || !text.trim()}
            >
              {sentiment.isPending ? (
                <>
                  <BarChart3 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Analyze Sentiment
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Results */}
        {sentiment.data && (
          <div className="space-y-4">
            {/* Overall Sentiment */}
            <Card className="border-2">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getSentimentIcon(sentiment.data.sentiment)}
                    <div>
                      <div className="text-2xl font-bold capitalize">
                        {sentiment.data.sentiment}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Overall Sentiment
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold">
                      {getSentimentEmoji(sentiment.data.sentiment)}
                    </div>
                  </div>
                </div>

                {/* Score Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Sentiment Score</span>
                    <span className={`font-bold ${getSentimentColor(sentiment.data.sentiment)}`}>
                      {sentiment.data.score > 0 ? '+' : ''}{sentiment.data.score.toFixed(2)}
                    </span>
                  </div>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`absolute h-full transition-all ${
                        sentiment.data.sentiment === 'positive'
                          ? 'bg-green-500'
                          : sentiment.data.sentiment === 'negative'
                          ? 'bg-red-500'
                          : 'bg-gray-500'
                      }`}
                      style={{
                        width: `${Math.abs(sentiment.data.score) * 50}%`,
                        left: sentiment.data.score >= 0 ? '50%' : `${50 + sentiment.data.score * 50}%`,
                      }}
                    />
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Negative</span>
                    <span>Neutral</span>
                    <span>Positive</span>
                  </div>
                </div>

                {/* Confidence */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Confidence</span>
                    <span className="font-bold">{sentiment.data.confidence}%</span>
                  </div>
                  <Progress value={sentiment.data.confidence} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Breakdown */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="text-sm font-semibold mb-3">Sentiment Breakdown</div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Positive Keywords</span>
                    </div>
                    <Badge variant="default">{sentiment.data.breakdown.positive}</Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-500" />
                      <span className="text-sm">Negative Keywords</span>
                    </div>
                    <Badge variant="destructive">{sentiment.data.breakdown.negative}</Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Meh className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">Neutral</span>
                    </div>
                    <Badge variant="secondary">{sentiment.data.breakdown.neutral}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Details */}
            {sentiment.data.details && (
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Total Words</div>
                      <div className="text-2xl font-bold">{sentiment.data.details.totalWords}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Sentiment Words</div>
                      <div className="text-2xl font-bold">{sentiment.data.details.sentimentWords}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Interpretation */}
            <Alert className={
              sentiment.data.sentiment === 'positive'
                ? 'bg-green-50 border-green-200'
                : sentiment.data.sentiment === 'negative'
                ? 'bg-red-50 border-red-200'
                : 'bg-gray-50 border-gray-200'
            }>
              <AlertDescription className={
                sentiment.data.sentiment === 'positive'
                  ? 'text-green-800'
                  : sentiment.data.sentiment === 'negative'
                  ? 'text-red-800'
                  : 'text-gray-800'
              }>
                <strong>Interpretation:</strong>{' '}
                {sentiment.data.sentiment === 'positive' && 'This text expresses positive sentiment with optimistic or favorable language.'}
                {sentiment.data.sentiment === 'negative' && 'This text expresses negative sentiment with critical or unfavorable language.'}
                {sentiment.data.sentiment === 'neutral' && 'This text is neutral with balanced or factual language.'}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {sentiment.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to analyze sentiment. Please try again.
            </AlertDescription>
          </Alert>
        )}

        {!sentiment.data && !sentiment.isPending && (
          <div className="text-center py-12 text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">Enter text to analyze sentiment</p>
            <p className="text-xs mt-2">Detects positive, negative, or neutral tone in news, social media, and more</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
