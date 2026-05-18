import { useState } from "react";
import { Search, Shield, AlertTriangle, ExternalLink, Copy, CheckCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCXODorking } from "@/hooks/useOSINT";
import { Skeleton } from "@/components/ui/skeleton";

export function OSINTPanel() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);

  const dorking = useCXODorking();

  const handleSearch = () => {
    if (!name || !company) {
      alert("Please enter both name and company");
      return;
    }
    dorking.mutate({
      name,
      company,
      queries: ['linkedin', 'news', 'sec', 'github', 'twitter', 'leaks', 'files'],
    });
  };

  const copyQuery = (query: string, type: string) => {
    navigator.clipboard.writeText(query);
    setCopiedQuery(type);
    setTimeout(() => setCopiedQuery(null), 2000);
  };

  const openGoogleSearch = (query: string) => {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
  };

  return (
    <Card className="w-full">
      <CardHeader className="border-b border-[#F5C400]/20 bg-bg-dark/40">
        <CardTitle className="flex items-center gap-2 text-[#F5C400]">
          <Shield className="h-5 w-5 text-[#F5C400]" />
          Executive OSINT Dorking
        </CardTitle>
        <CardDescription className="text-[#F5C400]/60">
          Generate Google dork queries for OSINT investigation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Inputs */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#F5C400] opacity-80 uppercase tracking-wider ml-1">
              Executive Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter executive name..."
              className="bg-bg-dark/40 border-[#F5C400]/30 text-[#F5C400] focus:ring-[#F5C400]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#F5C400] opacity-80 uppercase tracking-wider ml-1">
              Organization
            </label>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Enter company name..."
              className="bg-bg-dark/40 border-[#F5C400]/30 text-[#F5C400] focus:ring-[#F5C400]"
            />
          </div>
          <Button
            onClick={handleSearch}
            className="w-full bg-[#F5C400] text-text-light hover:bg-[#F5C400]/80 font-bold transition-all duration-300"
            disabled={dorking.isPending || !name || !company}
          >
            {dorking.isPending ? (
              <>
                <Search className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Generate Dork Queries
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {dorking.data && (
          <div className="space-y-4">
            <Alert className="bg-bg-dark border-[#F5C400]/30 text-[#F5C400]">
              <AlertTriangle className="h-4 w-4 text-[#F5C400]" />
              <AlertDescription>
                <strong>OSINT Queries Generated:</strong> Copy and paste into Google for manual investigation.
                For automated results, integrate OSINT APIs.
              </AlertDescription>
            </Alert>

            <Tabs defaultValue="linkedin" className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-bg-dark border border-[#F5C400]/20">
                <TabsTrigger value="linkedin" className="data-[state=active]:bg-[#F5C400]/20 data-[state=active]:text-[#F5C400]">LinkedIn</TabsTrigger>
                <TabsTrigger value="news" className="data-[state=active]:bg-[#F5C400]/20 data-[state=active]:text-[#F5C400]">News</TabsTrigger>
                <TabsTrigger value="security" className="data-[state=active]:bg-[#F5C400]/20 data-[state=active]:text-[#F5C400]">Security</TabsTrigger>
                <TabsTrigger value="files" className="data-[state=active]:bg-[#F5C400]/20 data-[state=active]:text-[#F5C400]">Files</TabsTrigger>
              </TabsList>

              {/* LinkedIn Tab */}
              <TabsContent value="linkedin" className="space-y-3">
                {dorking.data.queries.linkedin && (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">LinkedIn Profile</Badge>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyQuery(dorking.data!.queries.linkedin, 'linkedin')}
                            >
                              {copiedQuery === 'linkedin' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openGoogleSearch(dorking.data!.queries.linkedin)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <code className="block p-3 bg-bg-dark border border-[#F5C400]/20 rounded text-xs break-all text-[#F5C400]">
                          {dorking.data.queries.linkedin}
                        </code>
                        <p className="text-xs text-[#F5C400]/50 italic">Manual search required for direct profile access.</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {dorking.data.queries.github && (
                  <Card className="bg-bg-mid/400 border-[#F5C400]/20">
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[#F5C400] border-[#F5C400]/30">GitHub Activity</Badge>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#F5C400] hover:bg-[#F5C400]/20 hover:text-white"
                              onClick={() => copyQuery(dorking.data!.queries.github, 'github')}
                            >
                              {copiedQuery === 'github' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#F5C400] hover:bg-[#F5C400]/20 hover:text-white"
                              onClick={() => openGoogleSearch(dorking.data!.queries.github)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <code className="block p-3 bg-bg-dark border border-[#F5C400]/20 rounded text-xs break-all text-[#F5C400]">
                          {dorking.data.queries.github}
                        </code>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* News Tab */}
              <TabsContent value="news" className="space-y-3">
                {dorking.data.findings.news?.results?.length > 0 ? (
                  <div className="space-y-3">
                    {dorking.data.findings.news.results.map((result: any, idx: number) => (
                      <Card key={idx} className="border-l-4 border-l-signal bg-bg-mid/400 border-y-signal/10 border-r-signal/10">
                        <CardContent className="pt-4 pb-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-sm line-clamp-2 text-white">{result.title}</h4>
                              <Button variant="ghost" size="sm" className="text-[#F5C400] hover:bg-[#F5C400]/20 hover:text-white" onClick={() => window.open(result.link, '_blank')}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                            <p className="text-xs text-[#F5C400]/70">{result.snippet}</p>
                            <span className={`w-fit px-2 py-0.5 rounded text-[10px] font-bold ${result.sentiment === 'negative' ? 'bg-red-500/20 text-red-400' : 'bg-[#F5C400]/20 text-[#F5C400]'}`}>
                              {result.sentiment.toUpperCase()}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-[#F5C400]/50 text-sm">
                    No recent negative news mentions found.
                  </div>
                )}

                {dorking.data.queries.news && (
                  <div className="mt-4 pt-4 border-t border-[#F5C400]/20 border-dashed">
                    <p className="text-xs font-semibold mb-2 text-[#F5C400]">Original Dork Query:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-bg-dark border border-[#F5C400]/20 rounded text-[10px] break-all text-[#F5C400]">
                        {dorking.data.queries.news}
                      </code>
                      <Button variant="outline" size="sm" className="border-[#F5C400]/30 text-[#F5C400] hover:bg-[#F5C400]/20 hover:text-white" onClick={() => openGoogleSearch(dorking.data!.queries.news)}>
                        <Search className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Security Tab */}
              <TabsContent value="security" className="space-y-3">
                {dorking.data.findings.leaks?.results?.length > 0 ? (
                  <div className="space-y-3">
                    {dorking.data.findings.leaks.results.map((result: any, idx: number) => (
                      <Card key={idx} className="border-l-4 border-l-red-500 bg-bg-mid/400 border-y-signal/10 border-r-signal/10">
                        <CardContent className="pt-4 pb-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-sm text-white">{result.title}</h4>
                              <Button variant="ghost" size="sm" className="text-[#F5C400] hover:bg-[#F5C400]/20 hover:text-white" onClick={() => window.open(result.link, '_blank')}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                            <p className="text-xs text-[#F5C400]/70">{result.snippet}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-[#F5C400]/50 text-sm">
                    No immediate leak/breach signatures detected in public indexes.
                  </div>
                )}

                <div className="space-y-3 mt-4">
                  {dorking.data.queries.leaks && (
                    <Card className="bg-bg-dark/30 border-[#F5C400]/20">
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">Manual Leak Search</Badge>
                            <Button variant="ghost" size="sm" className="text-[#F5C400] hover:bg-[#F5C400]/20 hover:text-white" onClick={() => openGoogleSearch(dorking.data!.queries.leaks)}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                          <code className="block p-3 bg-bg-dark border border-[#F5C400]/20 rounded text-xs break-all text-[#F5C400]">
                            {dorking.data.queries.leaks}
                          </code>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              {/* Files Tab */}
              <TabsContent value="files" className="space-y-3">
                {dorking.data.findings.files?.results?.length > 0 ? (
                  <div className="space-y-3">
                    {dorking.data.findings.files.results.map((result: any, idx: number) => (
                      <Card key={idx} className="border-l-4 border-l-blue-500 bg-bg-mid/400 border-y-signal/10 border-r-signal/10">
                        <CardContent className="pt-4 pb-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-sm line-clamp-1 text-white">{result.title}</h4>
                              <Button variant="ghost" size="sm" className="text-[#F5C400] hover:bg-[#F5C400]/20 hover:text-white" onClick={() => window.open(result.link, '_blank')}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                            <p className="text-xs text-[#F5C400]/70 font-mono">{result.link.substring(0, 60)}...</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-[#F5C400]/50 text-sm">
                    No exposed sensitive documents (PDF/DOC/XLS) found in direct search.
                  </div>
                )}

                {dorking.data.queries.files && (
                  <div className="mt-4 pt-4 border-t border-[#F5C400]/20 border-dashed">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-[#F5C400]">Deep File Dorking:</p>
                      <Badge variant="outline" className="text-[10px] text-[#F5C400] border-[#F5C400]/30">PDF/XLS/DOC</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-bg-dark border border-[#F5C400]/20 rounded text-[10px] break-all text-[#F5C400]">
                        {dorking.data.queries.files}
                      </code>
                      <Button variant="outline" size="sm" className="border-[#F5C400]/30 text-[#F5C400] hover:bg-[#F5C400]/20 hover:text-white" onClick={() => openGoogleSearch(dorking.data!.queries.files)}>
                        <Search className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <Alert className="bg-bg-dark border-[#F5C400]/30 mt-4">
              <AlertDescription className="text-[#F5C400]/80">
                <strong className="text-[#F5C400]">Pro Tip:</strong> {dorking.data.summary.recommendation}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {dorking.isError && (
          <Alert variant="destructive" className="bg-red-500/10 border-red-500/30 text-red-400 mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to generate OSINT queries. Please try again or check network.
            </AlertDescription>
          </Alert>
        )}

        {!dorking.data && !dorking.isPending && (
          <div className="text-center py-12 text-[#F5C400]/40">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">Enter executive name and company to generate OSINT queries</p>
            <p className="text-xs mt-2">Google dorking for background checks and intelligence gathering</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
