"use client";

import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { useEffect } from "react";

interface Props {
  onReady?: (term: any) => void;
  onInput?: (data: string) => void;
}

export default function WTermWrapper({ onReady, onInput }: Props) {
  const { ref, write } = useTerminal();

  useEffect(() => {
    if (ref.current && onReady) {
        onReady({
            write: (data: string) => write(data),
            focus: () => ref.current?.focus(),
            ref: ref
        });
    }
  }, [onReady, ref, write]);

  return (
    <div style={{ height: "100%", width: "100%", padding: '10px', background: '#0b011d' }} className="wterm-container">
      <Terminal
        ref={ref}
        autoResize={true}
        cursorBlink={true}
        style={{ height: '100%', width: '100%' }}
        onData={(data) => {
            // Passthrough for typing directly in terminal if needed
        }}
      />
      <style jsx global>{`
        .wterm-container .wterm-background {
            background-color: #0b011d !important;
        }
        .wterm-container .wterm-viewport {
            background-color: #0b011d !important;
        }
        .wterm-container canvas {
            filter: saturate(1.2);
        }
      `}</style>
    </div>
  );
}
