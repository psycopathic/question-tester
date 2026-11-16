import type { PersistenceAdapter, Skill } from 'ask-sdk-core';
import type { RequestEnvelope, ResponseEnvelope } from 'ask-sdk-model';
import brands from '../src/data/packs/brands.json';
import type { AttemptReport, AttemptReporter } from '../src/services/attempt-report.service';
import { entityId, parsePack } from '../src/services/pack.service';
import { createSkill } from '../src/skill';
import type { Question, QuestionPack, TestSession } from '../src/types';

export const brandsPack = parsePack({ id: 'brands', name: 'Brands', raw: brands });

export class MemoryAdapter implements PersistenceAdapter {
  store: Record<string, unknown> = {};
  async getAttributes() {
    return JSON.parse(JSON.stringify(this.store));
  }
  async saveAttributes(_envelope: RequestEnvelope, attributes: Record<string, unknown>) {
    this.store = JSON.parse(JSON.stringify(attributes));
  }
  async deleteAttributes() {
    this.store = {};
  }
}

export function recordingReporter(delivered = true) {
  const reports: AttemptReport[] = [];
  const reporter: AttemptReporter = { report: async (report) => (reports.push(report), delivered) };
  return { reports, reporter };
}

export function harness(reporter: AttemptReporter = recordingReporter().reporter, pack: QuestionPack = brandsPack, screen = true, packs: QuestionPack[] = [pack]) {
  const adapter = new MemoryAdapter();
  const skill: Skill = createSkill({ packs, reporter, persistenceAdapter: adapter });
  const send = (request: object, isNew = (request as { type?: string }).type === 'LaunchRequest'): Promise<ResponseEnvelope> =>
    skill.invoke({
      version: '1.0',
      session: { new: isNew, sessionId: 's', application: { applicationId: 'app' }, user: { userId: 'user-1' } },
      context: { System: { application: { applicationId: 'app' }, user: { userId: 'user-1' }, device: { deviceId: 'd', supportedInterfaces: screen ? { 'Alexa.Presentation.APL': { runtime: { maxVersion: '2024.1' } } } : {} }, apiEndpoint: 'https://api.amazonalexa.com' } },
      request: { requestId: 'r', timestamp: new Date().toISOString(), locale: 'en-US', ...request },
    } as unknown as RequestEnvelope);
  return {
    adapter,
    send,
    launch: () => send({ type: 'LaunchRequest' }),
    intent: (name: string, slots: Record<string, object> = {}) => send({ type: 'IntentRequest', intent: { name, confirmationStatus: 'NONE', slots } }),
    speech: (envelope: ResponseEnvelope) => (envelope.response.outputSpeech as { ssml: string }).ssml,
    session: () => (adapter.store as { session: TestSession }).session,
  };
}

/** Same shape Alexa sends for a slot with dynamic entities, including the static authority. */
export const answerSlot = (heard: string, ...letters: string[]) => ({
  answer: {
    name: 'answer',
    value: heard,
    confirmationStatus: 'NONE',
    resolutions: {
      resolutionsPerAuthority: [
        { authority: 'amzn1.er-authority.echo-sdk.app.ANSWER_ENTITY', status: { code: 'ER_SUCCESS_NO_MATCH' }, values: [] },
        letters.length
          ? { authority: 'amzn1.er-authority.echo-sdk.dynamic.app.ANSWER_ENTITY', status: { code: 'ER_SUCCESS_MATCH' }, values: letters.map((l) => ({ value: { name: heard, id: entityId(l) } })) }
          : { authority: 'amzn1.er-authority.echo-sdk.dynamic.app.ANSWER_ENTITY', status: { code: 'ER_SUCCESS_NO_MATCH' }, values: [] },
      ],
    },
  },
});

/** The options a correct dynamic entity engine resolves a phrase to, from the question data alone. */
export const resolve = (question: Question, phrase: string) => question.options.filter((o) => question.acceptedAnswers[o.id].some((p) => p.trim().toLowerCase() === phrase.toLowerCase())).map((o) => o.id);
