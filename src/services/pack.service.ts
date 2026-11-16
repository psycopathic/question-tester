import type { Question, QuestionPack } from '../types';

// Converts the official game's question pack format. Works for any pack and any option count from 2 to 6.

export const MAX_OPTIONS = 6;

interface RawPackQuestion {
  id?: string | number;
  que?: string;
  ans?: { value?: string; correct_entity?: string };
  options?: string[];
  dynamic_entities?: Record<string, string[]>;
  isActive?: boolean;
}

/** Entity IDs follow the pack format: option A is option_a. */
export function entityId(optionId: string): string {
  return `option_${optionId.toLowerCase()}`;
}

function fail(where: string, problem: string): never {
  throw new Error(`Invalid question pack at ${where}: ${problem}`);
}

function parseQuestion(raw: RawPackQuestion, where: string): Question {
  if (raw.id === undefined || raw.id === '') fail(where, 'missing id');
  if (!raw.que?.trim()) fail(where, 'missing question text');
  if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > MAX_OPTIONS) fail(where, `needs 2 to ${MAX_OPTIONS} options`);
  const letters = raw.options.map((_, i) => String.fromCharCode(65 + i));
  const entities = raw.dynamic_entities ?? {};

  const acceptedAnswers: Record<string, string[]> = {};
  letters.forEach((letter, i) => {
    const text = raw.options?.[i];
    if (!text?.trim()) fail(where, `option ${letter} has no text`);
    const phrases = entities[entityId(letter)];
    if (!Array.isArray(phrases)) fail(where, `${entityId(letter)} is missing`);
    // Some batches leave the list empty. The option's own text is then the only answer. Koyal's plan does the same.
    acceptedAnswers[letter] = phrases.some((phrase) => phrase?.trim()) ? phrases : [text];
  });
  const unknown = Object.keys(entities).find((key) => !letters.some((letter) => entityId(letter) === key));
  if (unknown) fail(where, `${unknown} has no matching option`);

  const correct = letters.find((letter) => entityId(letter) === raw.ans?.correct_entity);
  if (!correct) fail(where, `correct_entity "${raw.ans?.correct_entity}" is not an option`);
  const correctText = raw.options[letters.indexOf(correct)];
  if (raw.ans?.value !== correctText) fail(where, `ans.value "${raw.ans?.value}" does not match option ${correct}, "${correctText}"`);

  return { id: String(raw.id), question: raw.que, options: raw.options.map((text, i) => ({ id: letters[i], text })), correctOption: correct, acceptedAnswers };
}

/** Throws at load time, so bad data never reaches a user. Inactive questions are left out. */
export function parsePack({ id, name, spokenName, raw }: { id: string; name: string; spokenName?: string; raw: unknown }): QuestionPack {
  if (!Array.isArray(raw)) fail(id, 'needs a JSON array of questions');
  const active = (raw as RawPackQuestion[]).filter((question) => question.isActive !== false);
  if (active.length === 0) fail(id, 'has no active questions');
  const questions = active.map((question) => parseQuestion(question, `${id} question ${question.id}`));
  const ids = questions.map((question) => question.id);
  const repeated = ids.find((questionId, i) => ids.indexOf(questionId) !== i);
  if (repeated) fail(id, `duplicate question id ${repeated}`);
  return { id, name, spokenName, questions };
}

/** Alexa directive that makes this question's accepted answers recognisable. */
export function dynamicEntitiesDirective(question: Question) {
  return {
    type: 'Dialog.UpdateDynamicEntities' as const,
    updateBehavior: 'REPLACE' as const,
    types: [
      {
        name: 'ANSWER_ENTITY',
        values: question.options.map((option) => {
          const [value, ...synonyms] = question.acceptedAnswers[option.id].map((phrase) => phrase.trim()).filter(Boolean);
          return { id: entityId(option.id), name: { value, synonyms } };
        }),
      },
    ],
  };
}
