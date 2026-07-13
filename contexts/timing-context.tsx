"use client";

import React, { createContext, useContext, useRef, useCallback } from "react";

type TimingContextType = {
  markStart: (key: string) => void;
  markEnd: (key: string, label: string) => void;
};

const TimingContext = createContext<TimingContextType | null>(null);

export function TimingProvider({ children }: { children: React.ReactNode }) {
  const marks = useRef<Record<string, number>>({});

  const markStart = useCallback((key: string) => {
    marks.current[key] = performance.now();
  }, []);

  const markEnd = useCallback((key: string, label: string) => {
    const start = marks.current[key];
    if (start !== undefined) {
      const end = performance.now();
      const seconds = ((end - start) / 1000).toFixed(2);
      console.log(`[Timing] ${label}: ${seconds}s`);
      delete marks.current[key];
    }
  }, []);

  return (
    <TimingContext.Provider value={{ markStart, markEnd }}>
      {children}
    </TimingContext.Provider>
  );
}

export function useTiming() {
  const context = useContext(TimingContext);
  if (!context) {
    throw new Error("useTiming must be used within a TimingProvider");
  }
  return context;
}
