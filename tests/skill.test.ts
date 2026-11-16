import type { ResponseEnvelope } from 'ask-sdk-model';
import { PACKS } from '../src/data/catalog';
import { plainSpeech } from '../src/utils/speech';
import { answerSlot, brandsPack, harness, recordingReporter, resolve } from './helpers';

const directiveTypes = (r: ResponseEnvelope) => (r.response.directives ?? []).map((d) => d.type);
const entityDirective = (r: ResponseEnvelope) => (r.response.directives ?? []).find((d) => d.type === 'Dialog.UpdateDynamicEntities') as unknown as { updateBehavior: string; types: { name: string; values: { id: string; name: { value: string; synonyms: string[] } }[] }[] };

describe('opening the skill', () => {
  it('goes straight to the first question, with its options and entities', async () => {
    const h = harness();
    const res = await h.launch();
    expect(h.speech(res)).toContain('Question 1.');
    expect(h.speech(res)).toContain('Better ingredients');
    expect(h.speech(res)).toContain('Papa Murphy');
    expect(h.speech(res)).not.toMatch(/batch|mode/i);
    expect(res.response.shouldEndSession).toBe(false);
    expect(h.session().status).toBe('IN_PROGRESS');
    const directive = entityDirective(res);
    expect(directive.updateBehavior).toBe('REPLACE');
    expect(directive.types[0].name).toBe('ANSWER_ENTITY');
    expect(directive.types[0].values[0]).toEqual({ id: 'option_a', name: { value: "papa john's", synonyms: ['papa', "john's", 'papa john', 'john'] } });
  });

  it('continues a test in progress, and sends entities again for the new Alexa session', async () => {
    const h = harness();
    await h.launch();
    await h.intent('NextQuestionIntent');
    await h.send({ type: 'SessionEndedRequest', reason: 'EXCEEDED_MAX_REPROMPTS' });
    const res = await h.launch();
    expect(h.speech(res)).toContain('Welcome back. Question 2.');
    expect(directiveTypes(res)).toContain('Dialog.UpdateDynamicEntities');
  });

  it('starts fresh after a finished test', async () => {
    const h = harness();
    await h.launch();
    await h.intent('EndTestIntent');
    const runId = h.session().runId;
    expect(h.speech(await h.launch())).toContain('Welcome to Question Tester. Question 1.');
    expect(h.session().runId).not.toBe(runId);
  });

  it('discards saved progress from another pack or an old version of the skill', async () => {
    const h = harness();
    h.adapter.store = { session: { batchId: 'batch_001', mode: 'INTERACTIVE', status: 'IN_PROGRESS', currentIndex: 4, totalQuestions: 50, records: {} } };
    expect(h.speech(await h.launch())).toContain('Question 1.');
  });
});

describe('answering', () => {
  it.each([
    ['the correct option', "papa john's", ['A'], 'Option <say-as interpret-as="spell-out">A</say-as>. Correct.'],
    ['a wrong option', 'murphy', ['B'], 'Option <say-as interpret-as="spell-out">B</say-as>. Incorrect.'],
    ['a shared answer', 'papa', ['A', 'B'], 'That matches options <say-as interpret-as="spell-out">A</say-as> and <say-as interpret-as="spell-out">B</say-as>.'],
    ['an unknown phrase', 'purple elephant', [], "That doesn't match any option."],
  ])('replies with only the option and result for %s, and stays on the question', async (_name, heard, letters, reply) => {
    const h = harness();
    await h.launch();
    const res = await h.intent('AnswerEntityIntent', answerSlot(heard, ...letters));
    expect(h.speech(res)).toBe(`<speak>${reply}</speak>`);
    expect(h.session().currentIndex).toBe(0);
    expect(res.response.shouldEndSession).toBe(false);
  });

  it('never tells the user what to say next', async () => {
    const h = harness();
    await h.launch();
    const res = await h.intent('AnswerEntityIntent', answerSlot('papa', 'A'));
    expect(plainSpeech(h.speech(res))).not.toMatch(/say/i);
  });

  it('reports what it heard and matched, numbering each attempt', async () => {
    const { reports, reporter } = recordingReporter();
    const h = harness(reporter);
    await h.launch();
    await h.intent('AnswerEntityIntent', answerSlot("papa john's", 'A'));
    await h.intent('AnswerEntityIntent', answerSlot('murphy', 'B'));
    expect(reports[0]).toMatchObject({ packId: 'brands', questionId: '1', questionIndex: 0, totalQuestions: 47, attemptIndex: 0, heard: "papa john's", intent: 'AnswerEntityIntent', matchedOptions: ['A'], correct: true, response: 'Option A. Correct.' });
    expect(reports[1]).toMatchObject({ attemptIndex: 1, matchedOptions: ['B'], correct: false });
    expect(reports[0].runId).toBeTruthy();
    expect(reports[1].runId).toBe(reports[0].runId);
  });

  it('has no opinion on a shared answer or no match', async () => {
    const { reports, reporter } = recordingReporter();
    const h = harness(reporter);
    await h.launch();
    await h.intent('AnswerEntityIntent', answerSlot('papa', 'A', 'B'));
    await h.intent('AnswerEntityIntent', answerSlot('nothing'));
    expect(reports.map((r) => r.correct)).toEqual([null, null]);
  });

  it('counts a real fallback request as an answer that was not accepted', async () => {
    const { reports, reporter } = recordingReporter();
    const h = harness(reporter);
    await h.launch();
    expect(h.speech(await h.intent('AMAZON.FallbackIntent'))).toContain("doesn't match");
    expect(reports[0]).toMatchObject({ intent: 'AMAZON.FallbackIntent', resolutions: [], matchedOptions: [] });
    expect(reports[0].heard).toBeUndefined();
  });

  it('does not treat a static placeholder value as an answer', async () => {
    const h = harness();
    await h.launch();
    const slot = { answer: { name: 'answer', value: 'answer placeholder', confirmationStatus: 'NONE', resolutions: { resolutionsPerAuthority: [{ authority: 'static', status: { code: 'ER_SUCCESS_MATCH' }, values: [{ value: { name: 'answer placeholder', id: 'placeholder' } }] }] } } };
    expect(h.speech(await h.intent('AnswerEntityIntent', slot))).toContain("doesn't match");
  });

  it('keeps going and counts it when a report fails', async () => {
    const h = harness(recordingReporter(false).reporter);
    await h.launch();
    expect(h.speech(await h.intent('AnswerEntityIntent', answerSlot('papa', 'A')))).toContain('Correct');
    await h.intent('EndTestIntent');
    expect(h.session().reportFailures).toBe(1);
    expect(h.speech(await h.intent('RepeatQuestionIntent'))).toContain('Reports not delivered: 1.');
  });
});

describe('moving through the questions', () => {
  it('only moves on when asked, then reads the next question with its entities', async () => {
    const h = harness();
    await h.launch();
    const res = await h.intent('NextQuestionIntent');
    expect(h.speech(res)).toContain('Question 2.');
    expect(h.speech(res)).toContain('Square Enix');
    expect(entityDirective(res).types[0].values[0].name.value).toBe('ea games');
  });

  it('repeats the question with entities, keeping its place', async () => {
    const h = harness();
    await h.launch();
    await h.intent('NextQuestionIntent');
    const res = await h.intent('RepeatQuestionIntent');
    expect(h.speech(res)).toContain('Question 2.');
    expect(directiveTypes(res)).toContain('Dialog.UpdateDynamicEntities');
  });

  it('goes back, and says so on the first question', async () => {
    const h = harness();
    await h.launch();
    expect(h.speech(await h.intent('PreviousQuestionIntent'))).toContain('This is the first question.');
    await h.intent('NextQuestionIntent');
    expect(h.speech(await h.intent('PreviousQuestionIntent'))).toContain('Question 1.');
  });

  it('start over begins a new run from the first question', async () => {
    const h = harness();
    await h.launch();
    await h.intent('NextQuestionIntent');
    await h.intent('AnswerEntityIntent', answerSlot('ea', 'A'));
    const runId = h.session().runId;
    const res = await h.intent('StartTestIntent');
    expect(h.speech(res)).toContain('Starting the test. Question 1.');
    expect(h.session()).toMatchObject({ currentIndex: 0, attemptCount: 0, status: 'IN_PROGRESS' });
    expect(h.session().runId).not.toBe(runId);
  });

  it('ends the test when stopped, so the next open starts at the first question', async () => {
    const h = harness();
    await h.launch();
    await h.intent('NextQuestionIntent');
    const res = await h.intent('AMAZON.StopIntent');
    expect(res.response.shouldEndSession).toBe(true);
    expect(h.session().status).toBe('ENDED');
    expect(h.speech(await h.launch())).toContain('Welcome to Question Tester. Question 1.');
  });

  it('does not accept answers after the test has finished', async () => {
    const { reports, reporter } = recordingReporter();
    const h = harness(reporter);
    await h.launch();
    await h.intent('EndTestIntent');
    expect(h.speech(await h.intent('AnswerEntityIntent', answerSlot('papa', 'A')))).toContain('ended early');
    expect(reports).toHaveLength(0);
  });

  it('works without a screen', async () => {
    const h = harness(undefined, undefined, false);
    const res = await h.launch();
    expect(directiveTypes(res)).toEqual(['Dialog.UpdateDynamicEntities']);
  });
});

describe('the whole brands pack', () => {
  it('runs every accepted answer of every question through the skill, then finishes', async () => {
    const { reports, reporter } = recordingReporter();
    const h = harness(reporter);
    let res = await h.launch();
    let spoken = 0;
    for (const [index, question] of brandsPack.questions.entries()) {
      expect(h.speech(res)).toContain(`Question ${index + 1}.`);
      expect(directiveTypes(res)).toContain('Dialog.UpdateDynamicEntities');
      expect(entityDirective(res).types[0].values).toHaveLength(question.options.length);
      for (const option of question.options) {
        for (const phrase of question.acceptedAnswers[option.id]) {
          const reply = await h.intent('AnswerEntityIntent', answerSlot(phrase, ...resolve(question, phrase)));
          spoken += 1;
          expect(h.speech(reply)).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
        }
      }
      res = await h.intent('NextQuestionIntent');
      // Alexa rejects speech over 8000 characters, and a DynamoDB item over 400 KB.
      expect(h.speech(res).length).toBeLessThanOrEqual(8000);
      expect(Buffer.byteLength(JSON.stringify(h.adapter.store))).toBeLessThan(400 * 1024);
    }
    expect(h.speech(res)).toContain('The test is finished.');
    expect(h.session().status).toBe('COMPLETED');
    expect(reports).toHaveLength(spoken);
    expect(reports.every((r) => r.correct !== false || r.response.includes('Incorrect'))).toBe(true);
  }, 30000);
});

describe('going to a question by number', () => {
  const number = (value: string) => ({ number: { name: 'number', value, confirmationStatus: 'NONE' } });

  it('reads that question with its entities, and answers then belong to it', async () => {
    const { reports, reporter } = recordingReporter();
    const h = harness(reporter);
    await h.launch();
    const res = await h.intent('GoToQuestionIntent', number('12'));
    expect(h.speech(res)).toContain('Question 12.');
    expect(directiveTypes(res)).toContain('Dialog.UpdateDynamicEntities');
    expect(res.response.shouldEndSession).toBe(false);
    await h.intent('AnswerEntityIntent', answerSlot('x'));
    expect(reports[0].questionIndex).toBe(11);
  });

  it('starts a test when it is what opens the skill', async () => {
    const h = harness();
    expect(h.speech(await h.intent('GoToQuestionIntent', number('5')))).toContain('Question 5.');
    expect(h.session()).toMatchObject({ status: 'IN_PROGRESS', currentIndex: 4 });
    expect(h.session().runId).toEqual(expect.any(String));
  });

  it('keeps the same test when one is in progress', async () => {
    const h = harness();
    await h.launch();
    const runId = h.session().runId;
    await h.intent('GoToQuestionIntent', number('5'));
    expect(h.session().runId).toBe(runId);
  });

  it.each(['0', '48', '1.5', 'abc'])('stays where it is for %s', async (value) => {
    const h = harness();
    await h.launch();
    const res = await h.intent('GoToQuestionIntent', number(value));
    expect(h.speech(res)).toContain('There are 47 questions.');
    expect(h.session().currentIndex).toBe(0);
  });
});

describe('choosing the pack', () => {
  const pack = (id: string) => PACKS.find((p) => p.id === id)!;
  const named = (value: string, id?: string) => ({ pack: { name: 'pack', value, confirmationStatus: 'NONE', resolutions: { resolutionsPerAuthority: [{ authority: 'static', status: { code: id ? 'ER_SUCCESS_MATCH' : 'ER_SUCCESS_NO_MATCH' }, values: id ? [{ value: { name: value, id } }] : [] }] } } });
  const all = () => harness(undefined, undefined, true, PACKS);

  it('starts the pack Koyal names', async () => {
    const h = all();
    const res = await h.intent('OpenPackIntent', named('batch seven sports', 'batch_7/sports'));
    expect(h.session()).toMatchObject({ packId: 'batch_7/sports', status: 'IN_PROGRESS', currentIndex: 0 });
    expect(plainSpeech(h.speech(res))).toContain(pack('batch_7/sports').questions[0].question);
    expect(entityDirective(res).types[0].values.length).toBe(pack('batch_7/sports').questions[0].options.length);
  });

  it('stays on that pack for later requests and new sessions', async () => {
    const h = all();
    await h.intent('OpenPackIntent', named('pack questions movies', 'movies'));
    expect(plainSpeech(h.speech(await h.intent('NextQuestionIntent')))).toContain(pack('movies').questions[1].question);
    await h.launch();
    expect(h.session()).toMatchObject({ packId: 'movies', currentIndex: 1 });
  });

  it('replaces a test in progress on another pack', async () => {
    const h = all();
    await h.launch();
    await h.intent('NextQuestionIntent');
    await h.intent('OpenPackIntent', named('pack questions animals', 'animals'));
    expect(h.session()).toMatchObject({ packId: 'animals', currentIndex: 0 });
  });

  it('tells apart packs that share a topic', async () => {
    const h = all();
    await h.intent('OpenPackIntent', named('batch seven animals', 'batch_7/animals'));
    expect(h.session().packId).toBe('batch_7/animals');
    await h.intent('OpenPackIntent', named('pack questions animals', 'animals'));
    expect(h.session().packId).toBe('animals');
  });

  it('uses the words when Alexa did not resolve them', async () => {
    const h = all();
    await h.intent('OpenPackIntent', named('Batch Seven History'));
    expect(h.session().packId).toBe('batch_7/history');
  });

  it('starts the pack at the question Koyal names', async () => {
    const h = all();
    const slots = { ...named('pack questions movies', 'movies'), number: { name: 'number', value: '3', confirmationStatus: 'NONE' } };
    const res = await h.intent('OpenPackIntent', slots);
    expect(h.session()).toMatchObject({ packId: 'movies', status: 'IN_PROGRESS', currentIndex: 2 });
    expect(plainSpeech(h.speech(res))).toContain(`Question 3. ${pack('movies').questions[2].question}`);
    expect(entityDirective(res).types[0].values.length).toBe(pack('movies').questions[2].options.length);
  });

  it('refuses a start question the pack does not have, and keeps the current test', async () => {
    const h = all();
    await h.launch();
    const slots = { ...named('pack questions movies', 'movies'), number: { name: 'number', value: '9999', confirmationStatus: 'NONE' } };
    expect(h.speech(await h.intent('OpenPackIntent', slots))).toContain('There is no question with that number.');
    expect(h.session().packId).toBe('brands');
  });

  it('refuses a name it does not have, and keeps the current test', async () => {
    const h = all();
    await h.launch();
    expect(plainSpeech(h.speech(await h.intent('OpenPackIntent', named('purple elephant'))))).toContain("I don't have that question pack.");
    expect(h.session().packId).toBe('brands');
  });

  it('uses the first pack when nothing names one', async () => {
    const h = all();
    await h.launch();
    expect(h.session().packId).toBe('brands');
  });
});

describe('every pack', () => {
  it('reads and accepts the first question of each', async () => {
    for (const p of PACKS) {
      const h = harness(undefined, p);
      await h.launch();
      const question = p.questions[0];
      const option = question.options.find((o) => o.id === question.correctOption)!;
      const heard = question.acceptedAnswers[option.id][0];
      const res = await h.intent('AnswerEntityIntent', answerSlot(heard, ...resolve(question, heard)));
      expect(plainSpeech(h.speech(res))).not.toContain("doesn't match");
    }
  });
});
