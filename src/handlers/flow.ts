import type { HandlerInput } from 'ask-sdk-core';
import type { Response } from 'ask-sdk-model';
import { dynamicEntitiesDirective } from '../services/pack.service';
import { buildFinishedScreen, buildQuestionScreen } from '../services/screen.service';
import { currentQuestion } from '../services/session.service';
import { reply } from '../utils/response-builder';
import { ANSWER_REPROMPT, finishedSpeech, questionSpeech } from '../utils/speech';
import { contextOf } from './context';

/** Reads the current question. Entities go with every read, because this may be a new Alexa session. */
export function presentCurrent(input: HandlerInput, prefix = ''): Response {
  const { session, pack } = contextOf(input);
  const question = currentQuestion(session, pack);
  return reply(input, {
    speech: `${prefix} ${questionSpeech(question, session.currentIndex)}`.trim(),
    reprompt: ANSWER_REPROMPT,
    screen: { kind: 'question', data: buildQuestionScreen(session, pack) },
    directives: [dynamicEntitiesDirective(question)],
  });
}

export function presentFinished(input: HandlerInput): Response {
  const { session, pack } = contextOf(input);
  return reply(input, { speech: finishedSpeech(session), reprompt: 'Say start over to run it again.', screen: { kind: 'message', data: buildFinishedScreen(pack, session) } });
}
