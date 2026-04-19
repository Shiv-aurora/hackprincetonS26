// ReviewerContext: shared state for the reviewer persona — narrative text, timeline data, and assembly status.
import React, { createContext, useContext, useState } from "react";
import type { TimelineResponse } from "./types";

// Shape of the shared reviewer state available to all reviewer views.
interface ReviewerState {
  narrativeText: string;
  setNarrativeText: (t: string) => void;
  timelineData: TimelineResponse | null;
  setTimelineData: (d: TimelineResponse | null) => void;
  assembling: boolean;
  setAssembling: (b: boolean) => void;
  assembleError: string | null;
  setAssembleError: (e: string | null) => void;
}

const ReviewerContext = createContext<ReviewerState | null>(null);

// Provider that wraps any subtree needing access to reviewer state.
export const ReviewerContextProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [narrativeText, setNarrativeText] = useState<string>("");
  const [timelineData, setTimelineData] = useState<TimelineResponse | null>(null);
  const [assembling, setAssembling] = useState<boolean>(false);
  const [assembleError, setAssembleError] = useState<string | null>(null);

  return (
    <ReviewerContext.Provider
      value={{
        narrativeText,
        setNarrativeText,
        timelineData,
        setTimelineData,
        assembling,
        setAssembling,
        assembleError,
        setAssembleError,
      }}
    >
      {children}
    </ReviewerContext.Provider>
  );
};

// Hook that components use to access reviewer state — throws if used outside ReviewerContextProvider.
export function useReviewerContext(): ReviewerState {
  const ctx = useContext(ReviewerContext);
  if (!ctx) throw new Error("useReviewerContext must be used inside <ReviewerContextProvider>");
  return ctx;
}
