import React from 'react';
import LineWaves from './LineWaves';

export default function GoldenWaveBackground() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-auto">
        <LineWaves
          speed={0.3}
          innerLineCount={40}
          outerLineCount={40}
          warpIntensity={1.6}
          rotation={11}
          edgeFadeWidth={1}
          colorCycleSpeed={2.8}
          brightness={3}
          color1="#D4AF37"
          color2="#FFD966"
          color3="#F59E0B"
          enableMouseInteraction
          mouseInfluence={2}
        />
      </div>
    </div>
  );
}
