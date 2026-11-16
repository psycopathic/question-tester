import { getRequest, type HandlerInput, type RequestHandler } from 'ask-sdk-core';
import type { IntentRequest, Response } from 'ask-sdk-model';
import { currentQuestion } from '../services/session.service';
import { reply } from '../utils/response-builder';
import { heardText, matchedOptions, slotResolutions, type AnswerSlot } from '../utils/slot-parser';
import { ANSWER_REPROMPT, attemptSpeech, plainSpeech } from '../utils/speech';
import { contextOf, isIntent } from './context';
import { presentFinished } from './flow';

/** Tells the user which option Alexa accepted, reports it, and stays on this question. Moving on is the user's choice. */
async function handleAttempt(input: HandlerInput, intent: string, slot?: AnswerSlot): Promise<Response> {
  const { session, pack, reporter } = contextOf(input);
  const question = currentQuestion(session, pack);
  const matched = matchedOptions(slot, question);
  const speech = attemptSpeech(matched, question);

  const delivered = await reporter.report({
    runId: session.runId ?? '',
    packId: pack.id,
    questionId: question.id,
    questionIndex: session.currentIndex,
    totalQuestions: session.totalQuestions,
    attemptIndex: session.attemptCount,
    heard: heardText(slot),
    intent,
    resolutions: slotResolutions(slot),
    matchedOptions: matched,
    correct: matched.length === 1 ? matched[0] === question.correctOption : null,
    response: plainSpeech(speech),
    atUtc: new Date().toISOString(),
  });
  session.attemptCount += 1;
  if (!delivered) session.reportFailures += 1;

  return reply(input, { speech, reprompt: ANSWER_REPROMPT });
}

export const AnswerHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'AnswerEntityIntent'),
  handle(input) {
    if (contextOf(input).session.status !== 'IN_PROGRESS') return presentFinished(input);
    return handleAttempt(input, 'AnswerEntityIntent', getRequest<IntentRequest>(input.requestEnvelope).intent.slots?.answer as AnswerSlot | undefined);
  },
};

/** Words Alexa can't place are still an answer that wasn't accepted, which is what the test is looking for. */
export const FallbackHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'AMAZON.FallbackIntent'),
  handle(input) {
    if (contextOf(input).session.status !== 'IN_PROGRESS') return presentFinished(input);
    return handleAttempt(input, 'AMAZON.FallbackIntent');
  },
};
