import { useState } from "react";
import { Search, Building2, Github, TrendingUp, FileText, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCompanyEnrichment } from "@/hooks/useCompanyEnrichment";
import { useCompanySignals } from "@/hooks/useCompanySignals";
import { Skeleton } from "@/components/ui/skeleton";

export function CompanyIntelligencePanel() {
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState<{ domain?: string; name?: string } | null>(null);

  const { data: enrichmentData, isLoading: enrichmentLoading } = useCompanyEnrichment(
    activeSearch?.domain,
    activeSearch?.name,
    { enabled: !!activeSearch }
  );

  const { data: signalsData, isLoading: signalsLoading } = useCompanySignals(
    activeSearch?.name || enrichmentData?.company.name || "",
    activeSearch?.domain,
    { enabled: !!activeSearch }
  );

  const handleSearch = () => {
    const input = searchInput.trim();
    if (!input) return;

    // Detect if input is a domain or company name
    const isDomain = input.includes(".") && !input.includes(" ");
    setActiveSearch(isDomain ? { domain: input } : { name: input });
  };

  const getSignalColor = (strength: string) => {
    switch (strength) {
      case "critical": return "destructive";
      case "high": return "default";
      case "medium": return "secondary";
      default: return "outline";
    }
  };

  const getSignalIcon = (type: string) => {
    switch (type) {
      case "hiring_surge": return "👥";
      case "funding_event": return "💰";
      case "expansion_signal": return "🌍";
      case "technology_adoption": return "⚡";
      case "executive_movement": return "👔";
      case "financial_trigger": return "📊";
      default: return "📰";
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Company Intelligence
        </CardTitle>
        <CardDescription>
          Search companies for enrichment data, tech stack, and activity signals
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Bar */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter company name or domain (e.g., stripe.com)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={!searchInput.trim()}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {/* Results */}
        {activeSearch && (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="signals">Signals</TabsTrigger>
              <TabsTrigger value="tech">Tech Stack</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              {enrichmentLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : enrichmentData ? (
                <div className="space-y-4">
                  {/* Company Header */}
                  <div className="flex items-start gap-4">
                    {enrichmentData.github?.avatarUrl && (
                      <img
                        src={enrichmentData.github.avatarUrl}
                        alt={enrichmentData.company.name}
                        className="h-16 w-16 rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold">{enrichmentData.company.name}</h3>
                      {enrichmentData.company.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {enrichmentData.company.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {enrichmentData.company.location && (
                          <Badge variant="outline">📍 {enrichmentData.company.location}</Badge>
                        )}
                        {enrichmentData.company.founded && (
                          <Badge variant="outline">📅 Founded {enrichmentData.company.founded}</Badge>
                        )}
                        {enrichmentData.company.website && (
                          <a
                            href={enrichmentData.company.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Website
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* GitHub Stats */}
                  {enrichmentData.github && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Github className="h-4 w-4" />
                          GitHub Activity
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Public Repos</span>
                          <span className="font-medium">{enrichmentData.github.publicRepos}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Followers</span>
                          <span className="font-medium">{enrichmentData.github.followers}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* SEC Filings */}
                  {enrichmentData.secFilings && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          SEC Filings ({enrichmentData.secFilings.totalFilings})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {enrichmentData.secFilings.recentFilings.slice(0, 3).map((filing, idx) => (
                            <div key={idx} className="text-sm">
                              <div className="flex justify-between">
                                <span className="font-medium">{filing.form}</span>
                                <span className="text-muted-foreground">{filing.date}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Hacker News Mentions */}
                  {enrichmentData.hackerNewsMentions && enrichmentData.hackerNewsMentions.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Recent HN Mentions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {enrichmentData.hackerNewsMentions.slice(0, 3).map((mention, idx) => (
                            <div key={idx} className="space-y-1">
                              <a
                                href={mention.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm hover:underline line-clamp-2"
                              >
                                {mention.title}
                              </a>
                              <div className="flex gap-3 text-xs text-muted-foreground">
                                <span>⬆️ {mention.points} points</span>
                                <span>💬 {mention.comments} comments</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Data Sources */}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">Sources:</span>
                    {enrichmentData.sources.map((source) => (
                      <Badge key={source} variant="secondary" className="text-xs">
                        {source.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No data found for this company
                </p>
              )}
            </TabsContent>

            {/* Signals Tab */}
            <TabsContent value="signals" className="space-y-4">
              {signalsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : signalsData && signalsData.signals.length > 0 ? (
                <div className="space-y-3">
                  {/* Filter Notice */}
                  <Alert>
                    <TrendingUp className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Showing C-level and major firm events from the last 30 days only. 
                      Filtered for executive movements, funding, acquisitions, and strategic announcements.
                    </AlertDescription>
                  </Alert>

                  {/* Summary */}
                  <Card>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold">{signalsData.summary.totalSignals}</div>
                          <div className="text-xs text-muted-foreground">Total Signals</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold">{signalsData.summary.signalDiversity}</div>
                          <div className="text-xs text-muted-foreground">Signal Types</div>
                        </div>
                        <div>
                          <Badge variant={getSignalColor(signalsData.summary.strongestSignal?.strength || "low")}>
                            {signalsData.summary.strongestSignal?.strength || "N/A"}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">Strongest</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Signal List */}
                  {signalsData.signals.map((signal, idx) => (
                    <Card key={idx}>
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 flex-1">
                              <span className="text-lg">{getSignalIcon(signal.type)}</span>
                              <div className="flex-1">
                                <a
                                  href={signal.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium hover:underline line-clamp-2"
                                >
                                  {signal.title}
                                </a>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <Badge variant={getSignalColor(signal.strength)} className="text-xs">
                                    {signal.strength}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {signal.type.replace(/_/g, " ")}
                                  </Badge>
                                  {signal.recencyDays !== undefined && (
                                    <Badge variant="secondary" className="text-xs">
                                      {signal.recencyDays === 0 ? 'Today' : 
                                       signal.recencyDays === 1 ? 'Yesterday' :
                                       `${signal.recencyDays}d ago`}
                                    </Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {signal.source}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {Object.keys(signal.engagement).length > 0 && (
                            <div className="flex gap-3 text-xs text-muted-foreground">
                              {signal.engagement.points && <span>⬆️ {signal.engagement.points}</span>}
                              {signal.engagement.comments && <span>💬 {signal.engagement.comments}</span>}
                              {signal.engagement.stars && <span>⭐ {signal.engagement.stars}</span>}
                              {signal.engagement.mentions && <span>📢 {signal.engagement.mentions}</span>}
                              {signal.engagement.velocity && <span>📈 {signal.engagement.velocity}/week</span>}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    No C-level or major firm signals detected in the last 30 days
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Try a different company or check back later
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Tech Stack Tab */}
            <TabsContent value="tech" className="space-y-4">
              {enrichmentLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : enrichmentData?.techStack && enrichmentData.techStack.length > 0 ? (
                <div className="space-y-3">
                  {enrichmentData.techStack.map((tech, idx) => (
                    <Card key={idx}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{tech.name}</div>
                            <div className="text-xs text-muted-foreground">{tech.category}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">
                              {Math.round(tech.confidence * 100)}%
                            </div>
                            <div className="text-xs text-muted-foreground">confidence</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No tech stack data available
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}

        {!activeSearch && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">Search for a company to view intelligence data</p>
            <p className="text-xs mt-2">Try: stripe.com, OpenAI, or any company name</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
