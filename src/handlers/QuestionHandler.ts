import { getRequest, type HandlerInput, type RequestHandler } from 'ask-sdk-core';
import type { IntentRequest } from 'ask-sdk-model';
import { movePrevious, moveNext, moveToNumber, startTest } from '../services/session.service';
import type { QuestionPack } from '../types';
import { reply } from '../utils/response-builder';
import { ANSWER_REPROMPT } from '../utils/speech';
import { contextOf, isIntent } from './context';
import { presentCurrent, presentFinished } from './flow';

export const StartTestHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'StartTestIntent', 'AMAZON.StartOverIntent'),
  handle(input) {
    const { session, pack } = contextOf(input);
    startTest(session, pack);
    return presentCurrent(input, 'Starting the test.');
  },
};

/** The pack Alexa resolved the spoken name to. Falls back to the words, in case resolution didn't run. */
function namedPack(input: HandlerInput, packs: QuestionPack[]): QuestionPack | undefined {
  const slot = getRequest<IntentRequest>(input.requestEnvelope).intent.slots?.pack;
  const resolved = slot?.resolutions?.resolutionsPerAuthority?.find((authority) => authority.status.code === 'ER_SUCCESS_MATCH')?.values[0]?.value.id;
  return packs.find((pack) => pack.id === resolved) ?? packs.find((pack) => pack.spokenName === slot?.value?.trim().toLowerCase());
}

/** The question number Koyal said, if any. */
function spokenNumber(input: HandlerInput): number | undefined {
  const value = getRequest<IntentRequest>(input.requestEnvelope).intent.slots?.number?.value;
  return value === undefined || value === '' || value === '?' ? undefined : Number(value);
}

/**
 * Koyal says "ask question tester to open batch seven science", or "... open batch seven science at question 12"
 * when a run covers a range. The pack and the first question are all the skill needs to know about the run.
 */
export const OpenPackHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'OpenPackIntent'),
  handle(input) {
    const context = contextOf(input);
    const pack = namedPack(input, context.packs);
    if (!pack) return reply(input, { speech: "I don't have that question pack.", reprompt: ANSWER_REPROMPT });
    const number = spokenNumber(input);
    if (number !== undefined && (!Number.isInteger(number) || number < 1 || number > pack.questions.length)) {
      return reply(input, { speech: `There is no question with that number. There are ${pack.questions.length} questions.`, reprompt: ANSWER_REPROMPT });
    }
    context.pack = pack;
    startTest(context.session, pack);
    if (number !== undefined) moveToNumber(context.session, number);
    return presentCurrent(input);
  },
};

export const RepeatQuestionHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'RepeatQuestionIntent', 'AMAZON.RepeatIntent'),
  handle(input) {
    return contextOf(input).session.status === 'IN_PROGRESS' ? presentCurrent(input) : presentFinished(input);
  },
};

export const NextQuestionHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'NextQuestionIntent', 'AMAZON.NextIntent'),
  handle(input) {
    const { session } = contextOf(input);
    if (session.status !== 'IN_PROGRESS') return presentFinished(input);
    if (moveNext(session)) return presentCurrent(input);
    session.status = 'COMPLETED';
    return presentFinished(input);
  },
};

export const PreviousQuestionHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'PreviousQuestionIntent', 'AMAZON.PreviousIntent'),
  handle(input) {
    const { session } = contextOf(input);
    if (session.status !== 'IN_PROGRESS') return presentFinished(input);
    return presentCurrent(input, movePrevious(session) ? '' : 'This is the first question.');
  },
};

/** Lets Koyal test one question without going through the ones before it. Can also be what opens the skill. */
export const GoToQuestionHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'GoToQuestionIntent'),
  handle(input) {
    const { session, pack } = contextOf(input);
    const number = Number(getRequest<IntentRequest>(input.requestEnvelope).intent.slots?.number?.value);
    if (!Number.isInteger(number) || number < 1 || number > session.totalQuestions) {
      return reply(input, { speech: `There is no question with that number. There are ${session.totalQuestions} questions.`, reprompt: ANSWER_REPROMPT });
    }
    if (session.status !== 'IN_PROGRESS') startTest(session, pack);
    moveToNumber(session, number);
    return presentCurrent(input);
  },
};

export const EndTestHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'EndTestIntent'),
  handle(input) {
    const { session } = contextOf(input);
    if (session.status === 'IN_PROGRESS') session.status = 'ENDED';
    return presentFinished(input);
  },
};
