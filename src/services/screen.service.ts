import type { QuestionPack, TestSession } from '../types';

// Builds the data the APL documents render. All layout decisions live here, so they can be tested.

export interface GridDimensions {
  columns: number;
  rows: number;
}

/** 6 or 5 = 3 by 2, 4 = 2 by 2, 3 = 3 by 1, 2 = 2 by 1. */
export function gridDimensions(optionCount: number): GridDimensions {
  if (optionCount > 4) return { columns: 3, rows: 2 };
  return optionCount === 4 ? { columns: 2, rows: 2 } : { columns: optionCount, rows: 1 };
}

export interface OptionCard {
  id: string;
  text: string;
  isSelected: boolean;
}

export interface QuestionScreen {
  batchName: string;
  modeLabel: string;
  progress: string;
  question: string;
  rows: OptionCard[][];
}

export interface MessageScreen {
  title: string;
  subtitle: string;
  items: string[];
  hint: string;
}

export function buildQuestionScreen(session: TestSession, pack: QuestionPack): QuestionScreen {
  const question = pack.questions[session.currentIndex];
  const cards = question.options.map((option): OptionCard => ({ id: option.id, text: option.text, isSelected: false }));
  const { columns } = gridDimensions(cards.length);
  const rows: OptionCard[][] = [];
  for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns));
  return { batchName: pack.name, modeLabel: 'Answer test', progress: `Question ${session.currentIndex + 1} of ${session.totalQuestions}`, question: question.question, rows };
}

export function buildFinishedScreen(pack: QuestionPack, session: TestSession): MessageScreen {
  return {
    title: session.status === 'COMPLETED' ? 'Test finished' : 'Test ended early',
    subtitle: pack.name,
    items: [`Answers heard: ${session.attemptCount}`, ...(session.reportFailures > 0 ? [`Reports not delivered: ${session.reportFailures}`] : [])],
    hint: 'Say "start over" to run it again.',
  };
}
