// Domain types. Nothing here knows about Alexa.

export interface QuestionOption {
  /** Option letter, A to F. */
  id: string;
  text: string;
}

export interface Question {
  id: string;
  question: string;
  options: QuestionOption[];
  correctOption: string;
  /** What a user can say for each option, keyed by option ID. Comes from the pack's dynamic_entities. */
  acceptedAnswers: Record<string, string[]>;
}

export interface QuestionPack {
  id: string;
  name: string;
  /** What Koyal says to open this pack. */
  spokenName?: string;
  questions: Question[];
}

export type SessionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ENDED';

export interface TestSession {
  packId: string;
  currentIndex: number;
  totalQuestions: number;
  status: SessionStatus;
  /** Identifies this test in reports to Koyal. */
  runId?: string;
  /** Spoken answers so far, which also numbers each report. */
  attemptCount: number;
  /** Attempts that could not be reported to Koyal. */
  reportFailures: number;
}
