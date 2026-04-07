import { Shield, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OSINTPanel } from "@/components/panels/OSINTPanel";
import { SentimentPanel } from "@/components/panels/SentimentPanel";

export default function Intelligence() {
  return (
    <div className="flex flex-col h-full w-full bg-bg-dark overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-border-light flex items-center px-6 bg-bg-mid relative z-10 shrink-0">
        <Shield size={20} className="text-signal mr-3" />
        <span className="mono-label-lg font-bold text-white tracking-widest">INTELLIGENCE TOOLS</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <Tabs defaultValue="osint" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="osint" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                OSINT Dorking
              </TabsTrigger>
              <TabsTrigger value="sentiment" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Sentiment Analysis
              </TabsTrigger>
            </TabsList>

            <TabsContent value="osint">
              <OSINTPanel />
            </TabsContent>

            <TabsContent value="sentiment">
              <SentimentPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
