"use client";

import { useEffect } from "react";

type LengthMode = "short" | "detailed";

type ComposeControlPanelProps = {
  tone: string;
  onToneChange: (t: string) => void;
  lengthMode: LengthMode;
  onLengthChange: (l: LengthMode) => void;
  aiAssistEnabled: boolean;
  onAiAssistToggle: () => void;
};

function ComposeControlPanel(props: ComposeControlPanelProps) {
  void props;
  useEffect(() => {
    console.log("ComposeControlPanel mounted");
  }, []);

  return (
    <div
      style={{
        background: "red",
        height: "150px",
        width: "100%",
        zIndex: 9999,
      }}
    >
      CONTROL PANEL WORKING
    </div>
  );
}

export default ComposeControlPanel;
