'use client';

import { useEffect, useState } from 'react';

// components/Splash.tsx
export default function SplashGate({ children, min = 2000 }: { children: React.ReactNode; min?: number }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShow(false), min);
    return () => clearTimeout(t);
  }, [min]);

  if (show) {
    return (
      <div className="splash-screen">
        <div className="logo">
          <img src="/logo-trimzi.svg" alt="TrimZi" width={120} height={120} />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
