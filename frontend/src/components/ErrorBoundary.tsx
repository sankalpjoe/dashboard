
import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: "40px", 
          backgroundColor: "#1a1b26", 
          color: "#ff5757", 
          fontFamily: "monospace",
          height: "100vh",
          overflow: "auto"
        }}>
          <h1 style={{ borderBottom: "2px solid #ff5757", paddingBottom: "10px" }}>DASHINT FATAL EXCEPTION</h1>
          <p style={{ fontSize: "18px", fontWeight: "bold" }}>{this.state.error?.toString()}</p>
          <pre style={{ 
            backgroundColor: "rgba(0,0,0,0.3)", 
            padding: "20px", 
            border: "1px solid rgba(255,87,87,0.3)",
            whiteSpace: "pre-wrap"
          }}>
            {this.state.error?.stack}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              backgroundColor: "#ff5757",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            REBOOT SYSTEM
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
