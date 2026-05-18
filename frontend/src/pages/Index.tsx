import NavBar from "@/components/NavBar";
import Intel from "@/pages/Intel";
import Intelligence from "@/pages/Intelligence";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useState } from "react";

const Index = () => {
  const [activeTab, setActiveTab] = useState("INTEL");

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
      <ErrorBoundary>
        <NavBar activeTab={activeTab} setActiveTab={setActiveTab} />
      </ErrorBoundary>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {activeTab === "INTEL" ? (
          <ErrorBoundary>
            <Intel />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary>
            <Intelligence />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
};

export default Index;
