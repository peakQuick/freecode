"use client";

import { useState, useEffect } from 'react';

// Exact posings from C:\claude-code\src\components\LogoV2\Clawd.tsx
const POSES = {
  default: {
    r1: ' ▐▛███▜▌',
    r2: '▝▜█████▛▘',
    r3: '  ▘▘ ▝▝  '
  },
  'look-left': {
    r1: ' ▐▟███▟▌',
    r2: '▝▜█████▛▘',
    r3: '  ▘▘ ▝▝  '
  },
  'look-right': {
    r1: ' ▐▙███▙▌',
    r2: '▝▜█████▛▘',
    r3: '  ▘▘ ▝▝  '
  },
  'arms-up': {
    r1: '▗▟▛███▜▙▖',
    r2: ' ▜█████▛ ',
    r3: '  ▘▘ ▝▝  '
  }
};

const IDLE_SEQUENCE: (keyof typeof POSES)[] = ['default', 'default', 'look-left', 'default', 'look-right', 'default'];

export default function ClawdCompanion({ speech, isThinking }: { speech?: string, isThinking?: boolean }) {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setTick(t => t + 1);
        }, 500);
        return () => clearInterval(interval);
    }, []);

    let pose: keyof typeof POSES = IDLE_SEQUENCE[tick % IDLE_SEQUENCE.length];
    
    if (isThinking) {
        // More animated when thinking
        const thinkingPoses: (keyof typeof POSES)[] = ['arms-up', 'default', 'look-left', 'look-right'];
        pose = thinkingPoses[tick % thinkingPoses.length];
    }

    const currentPose = POSES[pose];

    return (
        <div className="companion-container">
            {speech && (
                <div className="speech-bubble">
                    <div className="line-top">╭───────────────────╮</div>
                    <div className="line-mid">│ {speech.padEnd(17)} │</div>
                    <div className="line-bot">╰──────┬────────────╯</div>
                    <div className="tail">      │</div>
                </div>
            )}
            <div className="sprite">
                <pre className="sprite-line">{currentPose.r1}</pre>
                <pre className="sprite-line">{currentPose.r2}</pre>
                <pre className="sprite-line">{currentPose.r3}</pre>
            </div>

            <style jsx>{`
                .companion-container {
                    position: absolute;
                    bottom: 60px;
                    right: 40px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    pointer-events: none;
                    font-family: 'JetBrains Mono', monospace;
                    z-index: 100;
                }
                .speech-bubble {
                    color: #D77757; /* Official claude color: rgb(215, 119, 87) */
                    margin-bottom: -5px;
                    font-size: 11px;
                    line-height: 1;
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
                }
                .sprite {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    color: #D77757; 
                }
                .sprite-line {
                    margin: 0;
                    padding: 0;
                    line-height: 1.0;
                    font-size: 14px;
                    white-space: pre;
                    background: #000;
                }
                pre { margin: 0; }
            `}</style>
        </div>
    );
}
