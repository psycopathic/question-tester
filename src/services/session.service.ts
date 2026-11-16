import { randomUUID } from 'node:crypto';
import type { Question, QuestionPack, TestSession } from '../types';

// Test state machine. Pure logic with no Alexa dependency.

export function newSession(pack: QuestionPack): TestSession {
  return { packId: pack.id, currentIndex: 0, totalQuestions: pack.questions.length, status: 'NOT_STARTED', attemptCount: 0, reportFailures: 0 };
}

/** Returns a usable session, discarding saved state that no longer matches the pack. */
export function restoreSession(saved: unknown, pack: QuestionPack): TestSession {
  const session = saved as TestSession | undefined;
  if (!session || session.packId !== pack.id || session.totalQuestions !== pack.questions.length) return newSession(pack);
  return session;
}

export function startTest(session: TestSession, pack: QuestionPack): void {
  Object.assign(session, newSession(pack), { status: 'IN_PROGRESS', runId: randomUUID() });
}

export function currentQuestion(session: TestSession, pack: QuestionPack): Question {
  return pack.questions[session.currentIndex];
}

/** Returns false when already on the last question. */
export function moveNext(session: TestSession): boolean {
  if (session.currentIndex >= session.totalQuestions - 1) return false;
  session.currentIndex += 1;
  return true;
}

/** Returns false when there is no question with this number. */
export function moveToNumber(session: TestSession, number: number): boolean {
  if (!Number.isInteger(number) || number < 1 || number > session.totalQuestions) return false;
  session.currentIndex = number - 1;
  return true;
}

/** Returns false when already on the first question. */
export function movePrevious(session: TestSession): boolean {
  if (session.currentIndex === 0) return false;
  session.currentIndex -= 1;
  return true;
}
