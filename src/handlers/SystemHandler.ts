import { getRequestType, type ErrorHandler, type RequestHandler } from 'ask-sdk-core';
import { reply } from '../utils/response-builder';
import { ANSWER_REPROMPT } from '../utils/speech';
import { contextOf, isIntent } from './context';

// Amazon's required built-ins and lifecycle requests.

export const HelpHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'AMAZON.HelpIntent'),
  handle(input) {
    const speech = 'Say an answer, and I will tell you which option I accepted. You can also say next question, repeat the question, start over, or end the test.';
    return reply(input, { speech, reprompt: ANSWER_REPROMPT });
  },
};

/** Stopping on purpose ends the test, so the next open starts fresh. Only a dropped session resumes. */
export const StopHandler: RequestHandler = {
  canHandle: (input) => isIntent(input, 'AMAZON.StopIntent', 'AMAZON.CancelIntent', 'AMAZON.NavigateHomeIntent'),
  handle(input) {
    const { session } = contextOf(input);
    if (session.status === 'IN_PROGRESS') session.status = 'ENDED';
    return reply(input, { speech: 'Goodbye.', endSession: true });
  },
};

export const SessionEndedHandler: RequestHandler = {
  canHandle: (input) => getRequestType(input.requestEnvelope) === 'SessionEndedRequest',
  handle: (input) => input.responseBuilder.getResponse(),
};

export const SkillErrorHandler: ErrorHandler = {
  canHandle: () => true,
  handle(input, error) {
    console.error(`[skill] ${error.name}: ${error.message}`);
    const speech = 'Sorry, something went wrong. Please try that again.';
    return input.responseBuilder.speak(speech).reprompt(speech).getResponse();
  },
};
