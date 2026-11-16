import { LogAttemptReporter, type AttemptReport } from '../src/services/attempt-report.service';
import { parsePack } from '../src/services/pack.service';
import { gridDimensions } from '../src/services/screen.service';
import { heardText, matchedOptions, slotResolutions } from '../src/utils/slot-parser';
import { escapeSsml, plainSpeech } from '../src/utils/speech';
import { answerSlot, brandsPack } from './helpers';

describe('parsePack', () => {
  const question = (over: object = {}) => ({ id: 7, que: 'Which?', ans: { value: 'Two', correct_entity: 'option_b' }, options: ['One', 'Two', 'Three', 'Four'], dynamic_entities: { option_a: ['one'], option_b: ['two'], option_c: ['three'], option_d: ['four', 'for'] }, isActive: true, ...over });

  it('keeps every brands question', () => {
    expect(brandsPack.questions).toHaveLength(47);
    expect(brandsPack.questions[2].correctOption).toBe('B');
    expect(brandsPack.questions[0].acceptedAnswers.B).toContain('murphy');
  });

  it('is not tied to brands or to three options', () => {
    const pack = parsePack({ id: 'p', name: 'P', raw: [question()] });
    expect(pack.questions[0].options.map((o) => o.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(pack.questions[0].id).toBe('7');
  });

  it('accepts the option text when the entity list is empty', () => {
    const pack = parsePack({ id: 'p', name: 'P', raw: [question({ dynamic_entities: { option_a: ['one'], option_b: [], option_c: ['three'], option_d: ['four'] } })] });
    expect(pack.questions[0].acceptedAnswers.B).toEqual(['Two']);
  });

  it('leaves out inactive questions', () => {
    expect(parsePack({ id: 'p', name: 'P', raw: [question(), question({ id: 8, isActive: false })] }).questions.map((q) => q.id)).toEqual(['7']);
  });

  it.each([
    ['a non-array pack', {}, /JSON array/],
    ['no active questions', [question({ isActive: false })], /no active questions/],
    ['a missing question', [question({ que: ' ' })], /missing question text/],
    ['too few options', [question({ options: ['One'] })], /2 to 6 options/],
    ['an option with no entity list', [question({ dynamic_entities: { option_a: ['one'], option_c: ['three'], option_d: ['four'] } })], /option_b is missing/],
    ['an entity with no option', [question({ dynamic_entities: { option_a: ['1'], option_b: ['2'], option_c: ['3'], option_d: ['4'], option_e: ['5'] } })], /option_e has no matching/],
    ['an unknown correct entity', [question({ ans: { value: 'Two', correct_entity: 'option_z' } })], /correct_entity/],
    ['an answer value that disagrees', [question({ ans: { value: 'One', correct_entity: 'option_b' } })], /ans.value/],
    ['a repeated question id', [question(), question()], /duplicate question id 7/],
  ])('rejects %s', (_name, raw, message) => {
    expect(() => parsePack({ id: 'p', name: 'P', raw })).toThrow(message);
  });
});

describe('slot parsing', () => {
  const q = brandsPack.questions[0];
  it('reads every matching option from any authority, in order', () => {
    expect(matchedOptions(answerSlot('papa', 'B', 'A').answer, q)).toEqual(['A', 'B']);
  });
  it('ignores options this question does not have', () => {
    expect(matchedOptions(answerSlot('x', 'D').answer, q)).toEqual([]);
  });
  it('copes with an empty slot', () => {
    expect(matchedOptions(undefined, q)).toEqual([]);
    expect(heardText(undefined)).toBeUndefined();
    expect(heardText({ value: ' ' })).toBeUndefined();
    expect(slotResolutions(undefined)).toEqual([]);
  });

  it('reports each entity source as Alexa resolved it', () => {
    expect(slotResolutions(answerSlot('papa', 'B').answer)).toEqual([
      { source: 'static', status: 'ER_SUCCESS_NO_MATCH', values: [] },
      { source: 'dynamic', status: 'ER_SUCCESS_MATCH', values: [{ id: 'option_b', name: 'papa' }] },
    ]);
  });
});

describe('speech helpers', () => {
  it('round-trips text through SSML', () => {
    const text = `M&M's <"new">`;
    expect(plainSpeech(`<say-as>${escapeSsml(text)}</say-as>`)).toBe(text);
  });
});

describe('gridDimensions', () => {
  it.each([[2, 2, 1], [3, 3, 1], [4, 2, 2], [5, 3, 2], [6, 3, 2]])('%i options', (count, columns, rows) => {
    expect(gridDimensions(count)).toEqual({ columns, rows });
  });
});

describe('LogAttemptReporter', () => {
  it('writes the line Koyal reads from CloudWatch', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const report = { runId: 'r', packId: 'animals', questionId: '1', questionIndex: 0, totalQuestions: 2, attemptIndex: 0, intent: 'AnswerEntityIntent', resolutions: [], matchedOptions: ['A'], correct: true, response: 'Option A. Correct.', atUtc: '2026-11-05T10:00:00.000Z' } as AttemptReport;
    expect(await new LogAttemptReporter().report(report)).toBe(true);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual({ event: 'attemptReport', ...report });
    log.mockRestore();
  });
});
