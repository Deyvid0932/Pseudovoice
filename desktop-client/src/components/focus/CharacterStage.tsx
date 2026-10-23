import type { VoiceProfile } from "../../types/voice";

export interface CharacterStageProps {
  profile: VoiceProfile | null;
}

/**
 * Clean spatial audio backdrop without distracting images.
 * Provides deep studio ambiance and a subtle vignette so the central
 * audio orb is the undisputed focal point.
 */
export function CharacterStage({ profile }: CharacterStageProps) {
  const palette = profile?.palette ?? ["#2dd4bf", "#0f766e"];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Subtle atmospheric glow keyed to active character palette */}
      <div
        className="absolute inset-0 opacity-40 transition-all duration-700"
        style={{
          background: `radial-gradient(65% 55% at 50% 50%, ${palette[0]}15 0%, transparent 70%)`,
        }}
      />
      {/* Fine studio grid */}
      <div className="pv-grid-bg absolute inset-0 opacity-20" />
      {/* Deep cinematic vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_50%_50%,transparent_0%,rgba(5,5,6,0.65)_70%,rgba(5,5,6,0.98)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent" />
    </div>
  );
}
