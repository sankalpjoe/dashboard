import { Navigation } from "lucide-react";
import { RoutePlannerPanel } from "@/components/panels/RoutePlannerPanel";

import { Location } from "@/hooks/useRoutePlanner";

interface RoutesProps {
  onRouteUpdate: (analysis: any) => void;
  onSelectRoute: (index: number) => void;
  onIncidentsUpdate: (incidents: any[]) => void;
  origin: Location | null;
  destination: Location | null;
  onOriginChange: (loc: Location | null) => void;
  onDestinationChange: (loc: Location | null) => void;
  incidents: any[];
}

export default function Routes({
  onRouteUpdate,
  onSelectRoute,
  onIncidentsUpdate,
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  incidents
}: RoutesProps) {
  return (
    <div className="flex flex-col h-full w-full bg-bg-dark overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/10 flex items-center gap-2">
        <div className="p-2 bg-red-950/30 rounded border border-red-900/20">
          <Navigation className="h-5 w-5 text-red-500" />
        </div>
        <h2 className="text-xl font-bold tracking-tighter text-red-500 uppercase">Route Intelligence</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <RoutePlannerPanel
          onRouteUpdate={onRouteUpdate}
          onSelectRoute={onSelectRoute}
          onIncidentsUpdate={onIncidentsUpdate}
          origin={origin}
          destination={destination}
          onOriginChange={onOriginChange}
          onDestinationChange={onDestinationChange}
          incidents={incidents}
        />
      </div>
    </div>
  );
}
