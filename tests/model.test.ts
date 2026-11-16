import messageDocument from '../src/apl/message-screen.json';
import questionDocument from '../src/apl/question-screen.json';
import model from '../skill-package/interactionModels/custom/en-US.json';
import { PACKS } from '../src/data/catalog';
import { harness } from './helpers';

const { intents, types } = model.interactionModel.languageModel;

describe('interaction model', () => {
  it('declares the required intents, and none for batches, modes or letters', () => {
    const names = intents.map((i) => i.name);
    for (const name of ['AnswerEntityIntent', 'StartTestIntent', 'RepeatQuestionIntent', 'NextQuestionIntent', 'PreviousQuestionIntent', 'GoToQuestionIntent', 'EndTestIntent', 'AMAZON.HelpIntent', 'AMAZON.StopIntent', 'AMAZON.CancelIntent', 'AMAZON.FallbackIntent', 'AMAZON.NavigateHomeIntent']) expect(names).toContain(name);
    for (const name of ['SelectBatchIntent', 'SelectModeIntent', 'AnswerQuestionIntent']) expect(names).not.toContain(name);
  });

  it('has a handler for every declared intent', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = harness();
    await h.launch();
    for (const { name } of intents) {
      if (name === 'EndTestIntent') continue;
      const res = await h.intent(name);
      expect(h.speech(res)).not.toContain('something went wrong');
    }
    jest.restoreAllMocks();
  });

  it('uses each sample utterance only once, across all intents', () => {
    const samples = intents.flatMap((i) => i.samples.map((s) => s.toLowerCase()));
    expect(samples.filter((s, i) => samples.indexOf(s) !== i)).toEqual([]);
  });

  it('references only declared slots, and declared slot types exist', () => {
    const typeNames = new Set(types.map((t) => t.name));
    for (const intent of intents) {
      const slots = (intent as { slots?: { name: string; type: string }[] }).slots ?? [];
      for (const sample of intent.samples) for (const [, slot] of sample.matchAll(/\{(\w+)\}/g)) expect(slots.map((s) => s.name)).toContain(slot);
      for (const slot of slots) if (!slot.type.startsWith('AMAZON.')) expect(typeNames).toContain(slot.type);
    }
  });
});

describe('pack names', () => {
  it('list every pack with its spoken name and ID', () => {
    const values = types.find((t) => t.name === 'PACK_NAME')!.values as { id: string; name: { value: string } }[];
    expect(values.map((v) => [v.id, v.name.value])).toEqual(PACKS.map((p) => [p.id, p.spokenName]));
    expect(new Set(values.map((v) => v.name.value)).size).toBe(PACKS.length);
  });
});

describe('answer slot training values', () => {
  const values = new Set(types.find((t) => t.name === 'ANSWER_ENTITY')!.values.map((v) => v.name.value));

  it('include every speakable accepted answer of every pack, so Alexa can recognise them', () => {
    const missing = PACKS.flatMap((pack) => pack.questions).flatMap((question) => Object.values(question.acceptedAnswers).flat().map((phrase) => phrase.trim().toLowerCase())).filter((phrase) => /^[a-z0-9 .']+$/.test(phrase) && !values.has(phrase));
    expect(missing).toEqual([]);
  });

  it('never share a sample with a command, so an answer can not restart or move the test', () => {
    const commands = intents.filter((i) => i.name !== 'AnswerEntityIntent' && i.name !== 'OpenPackIntent').flatMap((i) => i.samples.map((s) => s.toLowerCase()));
    expect(commands.filter((sample) => values.has(sample))).toEqual([]);
  });

  it('carry no option IDs, so only the dynamic entities can choose an option', () => {
    for (const { id } of types.find((t) => t.name === 'ANSWER_ENTITY')!.values as { id?: string }[]) expect(id).toBeUndefined();
  });
});

describe('APL documents', () => {
  it('bind only screen fields that exist', () => {
    const fields = new Set(['batchName', 'modeLabel', 'progress', 'question', 'rows', 'title', 'subtitle', 'items', 'hint']);
    for (const document of [questionDocument, messageDocument]) {
      expect(document.mainTemplate.parameters).toEqual(['payload']);
      for (const [, field] of JSON.stringify(document).matchAll(/payload\.screen\.(\w+)/g)) expect(fields).toContain(field);
    }
  });
});
