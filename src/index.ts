import type { RequestEnvelope } from 'ask-sdk-model';
import { PACKS } from './data/catalog';
import { LogAttemptReporter } from './services/attempt-report.service';
import { DynamoDbSessionAdapter } from './services/persistence.service';
import { createSkill } from './skill';

const { SESSION_TABLE, SKILL_ID } = process.env;
if (!SESSION_TABLE) throw new Error('SESSION_TABLE is not set');

const skill = createSkill({
  packs: PACKS,
  reporter: new LogAttemptReporter(),
  persistenceAdapter: new DynamoDbSessionAdapter(SESSION_TABLE),
  skillId: SKILL_ID,
});

export const handler = (event: RequestEnvelope, context: unknown) => skill.invoke(event, context);
