import { getSupportedInterfaces, type HandlerInput } from 'ask-sdk-core';
import type { Directive, Response } from 'ask-sdk-model';
import messageDocument from '../apl/message-screen.json';
import questionDocument from '../apl/question-screen.json';
import type { MessageScreen, QuestionScreen } from '../services/screen.service';

export type Screen = { kind: 'question'; data: QuestionScreen } | { kind: 'message'; data: MessageScreen };

export interface Reply {
  /** SSML body. Dynamic content must already be escaped, see utils/speech.ts. */
  speech: string;
  reprompt?: string;
  screen?: Screen;
  endSession?: boolean;
  directives?: Directive[];
}

export function supportsApl(input: HandlerInput): boolean {
  return Boolean(getSupportedInterfaces(input.requestEnvelope)['Alexa.Presentation.APL']);
}

/** Devices without a screen get speech only. */
export function reply(input: HandlerInput, { speech, reprompt, screen, endSession = false, directives = [] }: Reply): Response {
  const builder = input.responseBuilder.speak(speech);
  if (reprompt && !endSession) builder.reprompt(reprompt);
  for (const directive of directives) builder.addDirective(directive);
  if (screen && supportsApl(input)) {
    builder.addDirective({
      type: 'Alexa.Presentation.APL.RenderDocument',
      token: `${screen.kind}Screen`,
      document: screen.kind === 'question' ? questionDocument : messageDocument,
      // APL binds the whole datasources object to a parameter named "payload", so this is read as payload.screen.
      datasources: { screen: screen.data },
    });
  }
  builder.withShouldEndSession(endSession);
  return builder.getResponse();
}
