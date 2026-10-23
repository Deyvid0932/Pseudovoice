import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Palette, VoiceProfile } from "../types/voice";
import { characterService } from "../services/characterService";
import { aiInferenceService, type CatalogVoice } from "../services/aiInferenceService";

const PALETTES: Palette[] = [
  ["#7dd3fc", "#4338ca"],
  ["#c4b5fd", "#7c3aed"],
  ["#2dd4bf", "#0f766e"],
  ["#f472b6", "#9333ea"],
];

const LEGACY_SAMPLE_CHARACTER_NAMES = new Set([
  "rem", "emilia", "miku", "aiko", "luna", "kira", "nova", "sora",
]);

export interface UseVoiceProfilesResult {
  profiles: VoiceProfile[];
  profileCount: number;
  activeProfile: VoiceProfile | null;
  activeProfileId: string | null;
  isLoading: boolean;
  addCharacter: (customName: string, voiceFile: File, avatarUrl?: string) => Promise<void>;
  addCatalogCharacter: (customName: string, voice: CatalogVoice) => Promise<void>;
  updateCharacter: (profile: VoiceProfile, name: string, avatarUrl: string | null, voice?: CatalogVoice, personalityPrompt?: string | null) => Promise<void>;
  selectActiveCharacter: (characterId: string) => void;
  deleteCharacter: (characterId: string) => Promise<void>;
  renameCharacter: (characterId: string, name: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useVoiceProfiles(userId: number = 1): UseVoiceProfilesResult {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const paletteIndexRef = useRef(0);

  const loadCharacters = useCallback(async () => {
    try {
      setIsLoading(true);
      const serverCharacters = await characterService.getCharactersByUser(userId);
      const userCharacters = serverCharacters.filter(
        (character) => {
          const isLegacySampleName = LEGACY_SAMPLE_CHARACTER_NAMES.has(character.characterName.trim().toLowerCase());
          const pointsToSampleAsset = character.referenceAudioPath.replace(/\\/g, "/").startsWith("/audios/samples/");
          return !(isLegacySampleName && pointsToSampleAsset);
        },
      );
      {
        const mapped: VoiceProfile[] = userCharacters.map((c, idx) => ({
          id: String(c.id),
          name: c.characterName,
          referenceAudioPath: c.referenceAudioPath,
          avatarUrl: c.avatarUrl || c.sourceAvatarUrl || null,
          sourceVoiceId: c.sourceVoiceId, sourceName: c.sourceName, sourceAvatarUrl: c.sourceAvatarUrl,
          personalityPrompt: c.personalityPrompt ?? null,
          archetype: c.language === "es" ? "Voz en Español" : "Voz Multilingüe",
          avatarSeed: `char-${c.id}-${c.characterName.toLowerCase()}`,
          palette: PALETTES[idx % PALETTES.length],
          status: idx === 0 ? "in_use" : "inactive",
        }));
        setProfiles(mapped);
      }
    } catch (e) {
      console.warn("No se pudieron cargar los personajes:", e);
      setProfiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  const addCharacter = useCallback(async (customName: string, voiceFile: File, avatarUrl?: string) => {
    const finalName = customName.trim();
    if (!finalName) throw new Error("Escribe un nombre para el personaje.");
    if (!/\.(wav|mp3)$/i.test(voiceFile.name)) throw new Error("La muestra debe ser WAV o MP3.");
    if (voiceFile.size > 20 * 1024 * 1024) throw new Error("La muestra no puede superar 20 MB.");
    const safeSlug = finalName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "voz";
    const referenceAudioName = `${safeSlug}-${crypto.randomUUID()}.${voiceFile.name.toLowerCase().endsWith(".mp3") ? "mp3" : "wav"}`;
    const referenceAudioPath = await aiInferenceService.uploadReferenceVoice(referenceAudioName, voiceFile, finalName);
    const created = await characterService.createCharacter(userId, {
      characterName: finalName,
      referenceAudioPath,
      language: "es",
      avatarUrl,
      providerSource: "fish",
      providerVoiceId: referenceAudioPath.replace(/^fish:/, ""),
    });
    const palette = PALETTES[paletteIndexRef.current++ % PALETTES.length];
    const newProfile: VoiceProfile = {
      id: String(created.id),
      name: created.characterName,
      referenceAudioPath: created.referenceAudioPath,
      avatarUrl: created.avatarUrl ?? null,
      archetype: created.language === "es" ? "Voz en Español" : "Voz Multilingüe",
      avatarSeed: `${created.characterName.toLowerCase()}-${created.id}`,
      palette,
      status: profiles.length === 0 ? "in_use" : "inactive",
    };
    setProfiles((prev) => [...prev, newProfile]);
  }, [profiles.length, userId]);

  const addCatalogCharacter = useCallback(async (customName: string, voice: CatalogVoice) => {
    const name = customName.trim();
    if (!name) throw new Error("Escribe un nombre para el personaje.");
    const created = await characterService.createCharacter(userId, {
      characterName: name, referenceAudioPath: `fish:${voice.id}`,
      language: voice.languages[0] || "es", avatarUrl: null,
      providerSource: "catalog", providerVoiceId: voice.id,
      catalogOriginalName: voice.name, catalogImageUrl: voice.avatar_url,
    });
    setProfiles(previous => [...previous, {
      id: String(created.id), name: created.characterName,
      referenceAudioPath: created.referenceAudioPath, avatarUrl: created.avatarUrl || voice.avatar_url,
      sourceVoiceId: voice.id, sourceName: voice.name, sourceAvatarUrl: voice.avatar_url,
      archetype: `Fish · ${voice.name}`, avatarSeed: `char-${created.id}`,
      palette: PALETTES[paletteIndexRef.current++ % PALETTES.length],
      status: previous.length ? "inactive" : "in_use",
    }]);
  }, [userId]);

  const updateCharacter = useCallback(async (profile: VoiceProfile, name: string, avatarUrl: string | null, voice?: CatalogVoice, personalityPrompt?: string | null) => {
    if (!name.trim()) throw new Error("Escribe un nombre.");
    const created = await characterService.updateCharacter(Number(profile.id), {
      characterName: name.trim(), referenceAudioPath: voice ? `fish:${voice.id}` : profile.referenceAudioPath || "",
      language: voice?.languages[0] || "es", avatarUrl,
      providerSource: voice ? "catalog" : profile.referenceAudioPath?.startsWith("fish:") ? "fish" : "local",
      providerVoiceId: voice?.id || (profile.referenceAudioPath?.startsWith("fish:") ? profile.referenceAudioPath.slice(5) : null),
      catalogOriginalName: voice?.name || null,
      catalogImageUrl: voice?.avatar_url || null,
      personalityPrompt: personalityPrompt === undefined ? profile.personalityPrompt ?? null : personalityPrompt,
    });
    setProfiles(previous => previous.map(item => item.id === profile.id ? {
      ...item, name: created.characterName, referenceAudioPath: created.referenceAudioPath,
      avatarUrl: created.avatarUrl || created.sourceAvatarUrl || voice?.avatar_url || null,
      sourceVoiceId: created.sourceVoiceId ?? null,
      sourceName: created.sourceName ?? null,
      sourceAvatarUrl: created.sourceAvatarUrl ?? null,
      personalityPrompt: created.personalityPrompt ?? null,
      archetype: created.sourceName ? `Fish · ${created.sourceName}` : created.providerSource === "fish" ? "Voz propia · Fish" : "Voz local",
    } : item));
  }, []);

  const selectActiveCharacter = useCallback((characterId: string) => {
    setProfiles((previous) =>
      previous.map((profile) => ({
        ...profile,
        status: profile.id === characterId ? "in_use" : "inactive",
      }))
    );
  }, []);

  const deleteCharacter = useCallback(async (characterId: string) => {
    const numericId = parseInt(characterId, 10);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new Error("El ID del personaje no es válido.");
    // Keep the character visible if Spring rejects the deletion or the request fails.
    await characterService.deleteCharacter(numericId);

    setProfiles((previous) => {
      const remaining = previous.filter((profile) => profile.id !== characterId);
      const stillHasActive = remaining.some((profile) => profile.status === "in_use");
      if (remaining.length > 0 && !stillHasActive) {
        return remaining.map((profile, index) =>
          index === 0 ? { ...profile, status: "in_use" } : profile
        );
      }
      return remaining;
    });
  }, []);

  const renameCharacter = useCallback(async (characterId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const numericId = parseInt(characterId, 10);
    if (!isNaN(numericId)) {
      const currentReference = profiles.find((profile) => profile.id === characterId)?.referenceAudioPath;
      try {
        await characterService.updateCharacter(numericId, {
          characterName: trimmed,
          referenceAudioPath: currentReference ?? "",
          language: "es",
          avatarUrl: profiles.find((profile) => profile.id === characterId)?.avatarUrl ?? null,
          personalityPrompt: profiles.find((profile) => profile.id === characterId)?.personalityPrompt ?? null,
        });
      } catch (e) {
        console.error("Error al renombrar personaje en backend:", e);
      }
    }

    setProfiles((previous) =>
      previous.map((profile) =>
        profile.id === characterId ? { ...profile, name: trimmed } : profile
      )
    );
  }, [profiles]);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.status === "in_use") ?? null,
    [profiles]
  );

  return {
    profiles,
    profileCount: profiles.length,
    activeProfile,
    activeProfileId: activeProfile?.id ?? null,
    isLoading,
    addCharacter,
    addCatalogCharacter,
    updateCharacter,
    selectActiveCharacter,
    deleteCharacter,
    renameCharacter,
    reload: loadCharacters,
  };
}
