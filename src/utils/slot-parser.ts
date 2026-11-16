import type { Question } from '../types';

// Reads what Alexa heard in the dynamic entity slot.

export interface AnswerSlot {
  value?: string;
  resolutions?: { resolutionsPerAuthority?: { authority?: string; status?: { code?: string }; values?: { value?: { name?: string; id?: string } }[] }[] };
}

/** How one entity source resolved the slot. Koyal uses it to explain why a phrase didn't match. */
export interface SlotResolution {
  /** dynamic: this question's answers. static: ANSWER_ENTITY in the interaction model, which has no options. */
  source: 'dynamic' | 'static';
  /** Alexa's status code, such as ER_SUCCESS_MATCH, ER_SUCCESS_NO_MATCH or ER_ERROR_TIMEOUT. */
  status: string;
  /** The entity values Alexa resolved to. For dynamic ones, id is the option's entity ID and name is its first answer. */
  values: { id?: string; name?: string }[];
}

export function heardText(slot: AnswerSlot | undefined): string | undefined {
  return slot?.value?.trim() || undefined;
}

/**
 * The options the slot resolved to, in A to F order. Every authority is checked, and more than one option
 * means an accepted answer is shared between options. Only entity IDs count, so a static placeholder value
 * can never be read as an answer.
 */
export function matchedOptions(slot: AnswerSlot | undefined, question: Question): string[] {
  const valid = new Set(question.options.map((option) => option.id));
  const letters = new Set<string>();
  for (const authority of slot?.resolutions?.resolutionsPerAuthority ?? []) {
    if (authority.status?.code !== 'ER_SUCCESS_MATCH') continue;
    for (const { value } of authority.values ?? []) {
      const letter = /^option_([a-f])$/.exec(value?.id ?? '')?.[1]?.toUpperCase();
      if (letter && valid.has(letter)) letters.add(letter);
    }
  }
  return [...letters].sort();
}

/** Every authority's result, as Alexa sent it. Empty when no slot was filled. */
export function slotResolutions(slot: AnswerSlot | undefined): SlotResolution[] {
  return (slot?.resolutions?.resolutionsPerAuthority ?? []).map((authority) => ({
    source: authority.authority?.includes('.dynamic.') ? 'dynamic' : 'static',
    status: authority.status?.code ?? 'UNKNOWN',
    values: (authority.values ?? []).map(({ value }) => ({ id: value?.id, name: value?.name })),
  }));
}
