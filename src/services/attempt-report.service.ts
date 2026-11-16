import type { SlotResolution } from '../utils/slot-parser';

/** What the skill heard for one spoken answer. Koyal decides what it means, because Koyal knows what it said. */
export interface AttemptReport {
  runId: string;
  packId: string;
  questionId: string;
  questionIndex: number;
  totalQuestions: number;
  attemptIndex: number;
  /** Raw slot text Alexa heard. Absent when no slot was filled. */
  heard?: string;
  intent: string;
  /** How Alexa resolved the slot, per entity source. Empty when no slot was filled. */
  resolutions: SlotResolution[];
  matchedOptions: string[];
  /** Whether the matched option is the correct one. Null unless exactly one option matched. */
  correct: boolean | null;
  /** Plain text of the reply Alexa was told to speak. */
  response: string;
  atUtc: string;
}

export interface AttemptReporter {
  /** Must never throw. Resolves to false when the report was not delivered. */
  report(report: AttemptReport): Promise<boolean>;
}

/** Koyal reads these log lines from CloudWatch when a run ends, so nothing has to be stored. */
export class LogAttemptReporter implements AttemptReporter {
  async report(report: AttemptReport): Promise<boolean> {
    console.log(JSON.stringify({ event: 'attemptReport', ...report }));
    return true;
  }
}
