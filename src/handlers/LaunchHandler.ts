import { getRequestType, type RequestHandler } from 'ask-sdk-core';
import { startTest } from '../services/session.service';
import { contextOf } from './context';
import { presentCurrent } from './flow';

/** There is nothing to choose, so opening the skill goes straight to a question. */
export const LaunchHandler: RequestHandler = {
  canHandle: (input) => getRequestType(input.requestEnvelope) === 'LaunchRequest',
  handle(input) {
    const { session, pack } = contextOf(input);
    if (session.status === 'IN_PROGRESS') return presentCurrent(input, 'Welcome back.');
    startTest(session, pack);
    return presentCurrent(input, 'Welcome to Question Tester.');
  },
};
