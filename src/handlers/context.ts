import { getRequestType, type HandlerInput, type RequestInterceptor, type ResponseInterceptor } from 'ask-sdk-core';
import type { AttemptReporter } from '../services/attempt-report.service';
import { restoreSession } from '../services/session.service';
import type { QuestionPack, TestSession } from '../types';

export interface SkillDeps {
  /** The first pack is the one used until a test names another. */
  packs: QuestionPack[];
  reporter: AttemptReporter;
}

export interface RequestContext {
  packs: QuestionPack[];
  pack: QuestionPack;
  reporter: AttemptReporter;
  session: TestSession;
}

const CONTEXT_KEY = 'testContext';

export function contextOf(input: HandlerInput): RequestContext {
  return input.attributesManager.getRequestAttributes()[CONTEXT_KEY] as RequestContext;
}

/** Logs every request, without user or device IDs, so a run on a real Echo can be traced. */
export const requestLogInterceptor: RequestInterceptor = {
  process({ requestEnvelope: { context, request } }) {
    const { intent, errors, reason } = request as { intent?: { name?: string; slots?: Record<string, { value?: string }> }; errors?: unknown; reason?: unknown };
    console.log(
      JSON.stringify({
        event: 'request',
        requestType: request.type,
        intent: intent?.name,
        heard: intent?.slots?.answer?.value,
        reason,
        interfaces: Object.keys(context.System.device?.supportedInterfaces ?? {}),
        errors,
      }),
    );
  },
};

/** Loads saved progress on every request, so a new Alexa session continues where the last one stopped. */
export function loadSessionInterceptor(deps: SkillDeps): RequestInterceptor {
  return {
    async process(input) {
      const { session } = (await input.attributesManager.getPersistentAttributes()) as { session?: TestSession };
      const pack = deps.packs.find((candidate) => candidate.id === session?.packId) ?? deps.packs[0];
      const context: RequestContext = { packs: deps.packs, pack, reporter: deps.reporter, session: restoreSession(session, pack) };
      input.attributesManager.setRequestAttributes({ [CONTEXT_KEY]: context });
    },
  };
}

export const saveSessionInterceptor: ResponseInterceptor = {
  async process(input) {
    input.attributesManager.setPersistentAttributes({ session: contextOf(input).session });
    await input.attributesManager.savePersistentAttributes();
  },
};

export function isIntent(input: HandlerInput, ...names: string[]): boolean {
  return getRequestType(input.requestEnvelope) === 'IntentRequest' && names.includes((input.requestEnvelope.request as { intent: { name: string } }).intent.name);
}
