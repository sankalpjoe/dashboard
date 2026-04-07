import BreakingTicker from "@/components/BreakingTicker";
import NavBar from "@/components/NavBar";
import LeftPanel from "@/components/LeftPanel";
import MapPanel from "@/components/MapPanel";
import RightPanel from "@/components/RightPanel";
import Timeline from "@/pages/Timeline";
import Intel from "@/pages/Intel";
import Assets from "@/pages/Assets";
import BusinessIntel from "@/pages/BusinessIntel";
import Routes from "@/pages/Routes";
import Intelligence from "@/pages/Intelligence";
import BottomBar from "@/components/BottomBar";
import ChatPanel from "@/components/ChatPanel";
import SettingsPanel from "@/components/SettingsPanel";
import type { PersonnelRecord } from "@/components/CsvUploader";
import type { NewsItem } from "@/lib/news-service";
import type { Vessel } from "@/lib/ship-service";
import type { WorldLeader } from "@/config/world-leaders";
import { useState } from "react";
import { Bot } from "lucide-react";
import { useLiveIntel } from "@/hooks/useIntel";
import { Location } from "@/hooks/useRoutePlanner";

const Index = () => {
  const [activeTab, setActiveTab] = useState("LIVE INTEL");
  const [chatOpen, setChatOpen] = useState(false);
  const [personnel, setPersonnel] = useState<PersonnelRecord[]>([]);
  const [activeLayers, setActiveLayers] = useState<string[]>(["CONFLICT_ZONES", "ARMED_CONFLICT", "AVIATION", "SHIP_TRAFFIC", "TRAFFIC", "ASSETS"]);
  const [routeAnalysis, setRouteAnalysis] = useState<any>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [origin, setOrigin] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [selectedLeader, setSelectedLeader] = useState<WorldLeader | null>(null);
  const { intel } = useLiveIntel();

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Breaking News Ticker */}
      <BreakingTicker />

      {/* Navigation Bar */}
      <NavBar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === "LIVE INTEL" ? (
          <>
            <div className="h-full border-r border-border-light overflow-y-auto bg-bg-mid flex-shrink-0">
              <LeftPanel onPersonnelUpload={setPersonnel} onSelectItem={setSelectedItem} />
            </div>
            <MapPanel
              personnel={personnel}
              activeLayers={activeLayers}
              incidents={incidents}
              onSelectVessel={(v) => { setSelectedVessel(v); setSelectedItem(null); setSelectedLeader(null); }}
              onSelectLeader={(l) => { setSelectedLeader(l); setSelectedVessel(null); setSelectedItem(null); }}
            />
            <RightPanel
              selectedItem={selectedItem}
              selectedVessel={selectedVessel}
              selectedLeader={selectedLeader}
              onClose={() => { setSelectedItem(null); setSelectedVessel(null); setSelectedLeader(null); }}
            />
          </>
        ) : activeTab === "TIMELINE" ? (
          <Timeline />
        ) : activeTab === "ASSETS" ? (
          <>
            <div className="w-[500px] border-r border-border-light h-full bg-bg-mid shadow-xl overflow-y-auto shrink-0 relative z-10">
              <Assets onPersonnelUpload={setPersonnel} />
            </div>
            <MapPanel personnel={personnel} activeLayers={activeLayers} />
          </>
        ) : activeTab === "INTEL" ? (
          <Intel />
        ) : (
          <>
            <LeftPanel onPersonnelUpload={setPersonnel} />
            <MapPanel personnel={personnel} activeLayers={activeLayers} />
            <SettingsPanel activeLayers={activeLayers} setActiveLayers={setActiveLayers} />
          </>
        )}
      </div>

      {/* Bottom Status Bar */}
      <BottomBar />

      {/* Floating AI Copilot Button */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-bg-dark border border-signal hover:bg-signal/20 transition-colors flex items-center justify-center rounded shadow-lg z-40 group"
      >
        <Bot size={24} className="text-signal group-hover:scale-110 transition-transform" />
      </button>

      {/* Slide-out Chat Panel */}
      <ChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        assets={personnel}
        intel={intel}
      />
    </div>
  );
};

export default Index;
