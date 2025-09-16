import { moderateText } from './openai';

// Keywords that explicitly allow face changes. If absent, we enforce preserving face.
const ALLOW_FACE_CHANGE_KEYWORDS = [
  'заменить лицо',
  'сменить лицо',
  'изменить лицо',
  'change face',
  'replace face',
  'swap face',
  'face swap',
  'смена лица',
  'другое лицо',
  'не сохранять лицо'
];

// Phrases to enforce preserving the face when not allowed
const PRESERVE_FACE_APPENDIX = ' Сохрани лицо без изменений, не меняй черты, идентичность и форму.';

/**
 * Enforce face-editing policy on user prompt.
 * - If prompt explicitly allows face change, pass through as-is (still subject to moderation).
 * - Otherwise, append instruction to preserve the face identity.
 */
export const enforceFacePolicy = async (prompt: string): Promise<string> => {
  const text = prompt.toLowerCase();
  const explicitlyAllowsFaceChange = ALLOW_FACE_CHANGE_KEYWORDS.some((k) => text.includes(k));

  // Run basic moderation regardless
  try {
    const mod = await moderateText(prompt);
    if (mod.flagged) {
      throw new Error('Prompt failed moderation');
    }
  } catch (e) {
    // If moderation fails or flags, block by throwing
    throw e instanceof Error ? e : new Error('Prompt moderation error');
  }

  if (explicitlyAllowsFaceChange) {
    return prompt.trim();
  }

  if (text.includes('сохрани лицо') || text.includes('keep face') || text.includes('не меняй лицо')) {
    return prompt.trim();
  }

  return `${prompt.trim()}${PRESERVE_FACE_APPENDIX}`;
};


