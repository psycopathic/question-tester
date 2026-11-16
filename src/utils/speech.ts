import type { Question, TestSession } from '../types';

// All spoken text. Dynamic content is escaped here because it ends up inside SSML.

export function escapeSsml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** The text of an SSML string, for reporting what was spoken. */
export function plainSpeech(ssml: string): string {
  return ssml.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function letter(id: string): string {
  return `<say-as interpret-as="spell-out">${escapeSsml(id)}</say-as>`;
}

export function questionSpeech(question: Question, index: number): string {
  const options = question.options.map((o) => `Option ${letter(o.id)}, ${escapeSsml(o.text)}.`).join(' ');
  return `Question ${index + 1}. ${escapeSsml(question.question)} ${options}`;
}

export const ANSWER_REPROMPT = 'Please say your answer.';

/** Short on purpose: the only job of this reply is to show which option Alexa accepted. */
export function attemptSpeech(matched: string[], question: Question): string {
  if (matched.length === 0) return "That doesn't match any option.";
  if (matched.length > 1) return `That matches options ${matched.map(letter).join(' and ')}.`;
  return `Option ${letter(matched[0])}. ${matched[0] === question.correctOption ? 'Correct' : 'Incorrect'}.`;
}

export function finishedSpeech(session: TestSession): string {
  const opening = session.status === 'COMPLETED' ? 'The test is finished.' : 'The test was ended early.';
  const undelivered = session.reportFailures > 0 ? ` Reports not delivered: ${session.reportFailures}.` : '';
  return `${opening}${undelivered} Say start over to run it again.`;
}
