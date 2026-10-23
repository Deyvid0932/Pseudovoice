import { useEffect, useState } from "react";

export interface UseBootSequenceResult {
  isBooting: boolean;
}

/**
 * Simulates the handshake with the native voice engine so the interface can
 * surface its loading skeletons before the runtime reports ready.
 */
export function useBootSequence(durationMs = 900): UseBootSequenceResult {
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsBooting(false), durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs]);

  return { isBooting };
}
