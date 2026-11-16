import { SkillBuilders, type PersistenceAdapter, type Skill } from 'ask-sdk-core';
import { AnswerHandler, FallbackHandler } from './handlers/AnswerHandler';
import { loadSessionInterceptor, requestLogInterceptor, saveSessionInterceptor, type SkillDeps } from './handlers/context';
import { LaunchHandler } from './handlers/LaunchHandler';
import { EndTestHandler, GoToQuestionHandler, NextQuestionHandler, OpenPackHandler, PreviousQuestionHandler, RepeatQuestionHandler, StartTestHandler } from './handlers/QuestionHandler';
import { HelpHandler, SessionEndedHandler, SkillErrorHandler, StopHandler } from './handlers/SystemHandler';

export interface SkillOptions extends SkillDeps {
  persistenceAdapter: PersistenceAdapter;
  skillId?: string;
}

export function createSkill({ persistenceAdapter, skillId, ...deps }: SkillOptions): Skill {
  const builder = SkillBuilders.custom()
    .addRequestHandlers(LaunchHandler, AnswerHandler, StartTestHandler, OpenPackHandler, RepeatQuestionHandler, NextQuestionHandler, PreviousQuestionHandler, GoToQuestionHandler, EndTestHandler, HelpHandler, StopHandler, FallbackHandler, SessionEndedHandler)
    .addRequestInterceptors(requestLogInterceptor, loadSessionInterceptor(deps))
    .addResponseInterceptors(saveSessionInterceptor)
    .addErrorHandlers(SkillErrorHandler)
    .withPersistenceAdapter(persistenceAdapter);
  if (skillId) builder.withSkillId(skillId);
  return builder.create();
}
