"""Import every batch of master-trivia-questions-and-answer-slots.xlsx as question packs.

Writes one file per batch and category, src/data/packs/master/master-<batch>-<category>.json, to this repo and
to koyal-harness, in the game's pack format (TEXT_QUESTIONS, IMAGE_QUESTIONS, AUDIO_QUESTIONS). Each non-empty
list becomes a pack. Also writes a generated catalog for each repo, and the pack names and answer training values
into the interaction model. The older packs, such as batch_7/, are left as they are.

Run from the repo root:
    uv run --with openpyxl python -I scripts/import-master-sheet.py master-trivia-questions-and-answer-slots.xlsx ../koyal-harness

Every question is imported as active, whatever
the sheet's TT/LT/TB flags say, so that every question can be tested.
"""

import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
XLSX = Path(sys.argv[1])
HARNESS = Path(sys.argv[2]).resolve()

SKILL_PACKS = ROOT / 'src/data/packs/master'
HARNESS_PACKS = HARNESS / 'src/lib/question-tests/packs/master'
SKILL_CATALOG = ROOT / 'src/data/master-catalog.ts'
HARNESS_CATALOG = HARNESS / 'src/lib/question-tests/masterPacks.ts'
MODEL = ROOT / 'skill-package/interactionModels/custom/en-US.json'

# sheet, ID prefix, display name, spoken name
BATCHES = [
    ('Batch1-Questions-5-10-2023', 'batch_1', 'Batch 1', 'batch one'),
    ('Batch2-Questions-27-11-2024', 'batch_2', 'Batch 2', 'batch two'),
    ('Batch3-Questions-25-7-2023', 'batch_3', 'Batch 3', 'batch three'),
    ('Batch4-Questions-17-10', 'batch_4', 'Batch 4', 'batch four'),
    ('TB batch 5--> batch 1 & 2', 'tb_batch_5', 'TB batch 5', 'batch five'),
    ('TB batch 6 --> batch 3 & 4', 'tb_batch_6', 'TB batch 6', 'batch six'),
    ('Batch-7-Questions', 'batch_7', 'Batch 7', 'batch seven'),
    ('TB batch 8 --> batch 9 & 10', 'tb_batch_8', 'TB batch 8', 'batch eight'),
    ('Batch9-Questions', 'batch_9', 'Batch 9', 'batch nine'),
    ('Batch10-Questions', 'batch_10', 'Batch 10', 'batch ten'),
    ('Batch9-Questions -old', 'batch_9_old', 'Batch 9 (old)', 'batch nine old'),
    ('Batch10-Questions - old', 'batch_10_old', 'Batch 10 (old)', 'batch ten old'),
    ('Batch11(Image & Audio)', 'batch_11', 'Batch 11', 'batch eleven'),
]

# slug, display name, spoken name
CATEGORIES = [
    ('animals', 'Animals', 'animals'),
    ('arts-and-entertainment', 'Arts & Entertainment', 'arts and entertainment'),
    ('general-knowledge', 'General Knowledge', 'general knowledge'),
    ('geography', 'Geography', 'geography'),
    ('history', 'History', 'history'),
    ('science', 'Science', 'science'),
    ('sports', 'Sports', 'sports'),
]

# Batch 1 keeps 5 more questions in a side table from column AI. Batch 4's side table repeats its main table.
SIDE_TABLES = {'Batch1-Questions-5-10-2023': {'Questions': 34, 'Category': 35, 'A': 36, 'Option_A_synonym': 37, 'B': 38, 'Option_B_synonym': 39, 'C': 40, 'Option_C_synonym': 41, 'Answer': 42, 'Description': 44}}

SPEAKABLE = re.compile(r"^[a-z0-9 .']+$")


def text(value):
    return re.sub(r'\s+', ' ', str(value)).strip() if value is not None else ''


def category_of(raw):
    key = re.sub(r'[^a-z]', '', raw.lower())
    for prefix, slug in [('anim', 'animals'), ('art', 'arts-and-entertainment'), ('entertain', 'arts-and-entertainment'), ('general', 'general-knowledge'), ('geo', 'geography'), ('hist', 'history'), ('sci', 'science'), ('sport', 'sports')]:
        if key.startswith(prefix):
            return slug
    return None


def column(headers, *names):
    for name in names:
        for i, header in enumerate(headers):
            if header.lower() == name.lower():
                return i
    return None


def read_rows(sheet):
    rows = list(sheet.iter_rows(values_only=True))
    headers = [text(h) for h in rows[0]]
    cols = {
        'id': column(headers, 'ID'),
        'question': column(headers, 'Questions', 'Question'),
        'category': column(headers, 'Category'),
        'round': column(headers, 'Round Type'),
        'answer': column(headers, 'Answer', 'Correct Answer'),
        # Batch 11 gives the correct option's text. The other sheets give its letter.
        'answer_text': None,
        # Batch 7 gives both: the letter is in Option Value, and the text may be spelled differently from the option.
        'letter': column(headers, 'Option Value'),
        'description': column(headers, 'Description', 'Fun Fact'),
        'asset': column(headers, 'Asset Filename'),
    }
    for letter in 'ABC':
        cols[letter] = column(headers, letter, f'Option {letter}')
        cols[f'{letter}syn'] = column(headers, f'Option_{letter}_synonym')
    out = []
    for n, row in enumerate(rows[1:], start=2):
        get = lambda key: row[cols[key]] if cols[key] is not None and cols[key] < len(row) else None
        out.append({k: get(k) for k in cols} | {'row': n, 'answer_text': column(headers, 'Correct Answer') is not None})
        side = SIDE_TABLES.get(sheet.title)
        if side and len(row) > side['Questions'] and row[side['Questions']]:
            s = lambda key: row[side[key]] if side.get(key) is not None and side[key] < len(row) else None
            out.append({'id': None, 'question': s('Questions'), 'category': s('Category'), 'round': None, 'answer': s('Answer'), 'description': s('Description'),
                        'A': s('A'), 'Asyn': s('Option_A_synonym'), 'B': s('B'), 'Bsyn': s('Option_B_synonym'), 'C': s('C'), 'Csyn': s('Option_C_synonym'), 'row': f'{n} (side table)', 'answer_text': False, 'asset': None})
    return out


def to_question(row, fallback_id):
    question = text(row['question'])
    options = [text(row[letter]) for letter in 'ABC']
    while options and not options[-1]:
        options.pop()
    if not question:
        return None, 'no question text'
    if len(options) < 2 or not all(options):
        return None, f'options {options}'
    answer = text(row['answer'])
    letter = text(row.get('letter'))
    if re.fullmatch(r'[A-Fa-f]', letter):
        index = ord(letter.upper()) - 65
    elif not row['answer_text'] and re.fullmatch(r'[A-Fa-f]', answer):
        index = ord(answer.upper()) - 65
    else:
        matches = [i for i, option in enumerate(options) if option.lower() == answer.lower()]
        index = matches[0] if matches else -1
    if not 0 <= index < len(options):
        return None, f'answer "{answer}" is not an option'
    entities = {}
    for i, option in enumerate(options):
        # Same shape as the game's own pack files: the option's text first, then the sheet's synonyms.
        phrases = OrderedDict()
        for phrase in [option] + str(row[f'{chr(65 + i)}syn'] or '').split('|'):
            phrase = text(phrase)
            if phrase:
                phrases.setdefault(phrase.lower(), phrase)
        entities[f'option_{chr(97 + i)}'] = list(phrases.values())
    description = text(row['description'])
    asset = text(row.get('asset'))
    round_type = text(row['round']).lower()
    return {
        'id': text(row['id']) or fallback_id,
        'que': question,
        'ans': {'value': options[index], 'correct_entity': f'option_{chr(97 + index)}'},
        'options': options,
        'expl': [description] if description else [],
        'url': [],
        'dynamic_entities': entities,
        'isActive': True,
        'imageUrl': asset if round_type == 'image' else '',
        'audioUrl': asset if round_type == 'audio' else '',
    } | ({'roundType': round_type} if round_type else {}), None


ROUNDS = {'': 'TEXT_QUESTIONS', 'text': 'TEXT_QUESTIONS', 'image': 'IMAGE_QUESTIONS', 'audio': 'AUDIO_QUESTIONS'}


def main():
    workbook = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    files = []  # (file name, {round key: questions})
    packs = []  # (id, spoken name, file name, round key)
    skipped = []
    for sheet_name, prefix, _, batch_spoken in BATCHES:
        groups = OrderedDict()
        for row in read_rows(workbook[sheet_name]):
            if not any(text(row[k]) for k in ('question', 'A', 'B', 'C')):
                continue
            slug = category_of(text(row['category'])) or category_of(text(row['id']))
            if not slug:
                skipped.append(f'{sheet_name} row {row["row"]}: no category')
                continue
            question, problem = to_question(row, f'{prefix}_row_{row["row"]}')
            if problem:
                skipped.append(f'{sheet_name} row {row["row"]}: {problem}')
                continue
            rounds = groups.setdefault(slug, {key: [] for key in ('TEXT_QUESTIONS', 'IMAGE_QUESTIONS', 'AUDIO_QUESTIONS')})
            rounds[ROUNDS[text(row['round']).lower()]].append(question)
        for slug, rounds in groups.items():
            seen = {}
            for question in [q for questions in rounds.values() for q in questions]:
                count = seen.get(question['id'], 0) + 1
                seen[question['id']] = count
                if count > 1:
                    question['id'] = f'{question["id"]}_{count}'
            file_name = f'master-{prefix}-{slug}'
            files.append((file_name, rounds))
            cat_spoken = next(c[2] for c in CATEGORIES if c[0] == slug)
            for key, suffix in (('TEXT_QUESTIONS', ''), ('IMAGE_QUESTIONS', 'image'), ('AUDIO_QUESTIONS', 'audio')):
                if rounds[key]:
                    pack_id = f'{file_name}-{suffix}' if suffix else file_name
                    spoken = f'master {batch_spoken} {cat_spoken}' + (f' {suffix}' if suffix else '')
                    packs.append((pack_id, spoken, file_name, key))

    for base in (SKILL_PACKS, HARNESS_PACKS):
        base.mkdir(parents=True, exist_ok=True)
        for file_name, rounds in files:
            (base / f'{file_name}.json').write_text(json.dumps(rounds, indent=2, ensure_ascii=False) + '\n')

    def catalog():
        lines = ['// Generated by scripts/import-master-sheet.py in skills-question-tester from master-trivia-questions-and-answer-slots.xlsx. Do not edit by hand.', '']
        variables = {}
        for i, (file_name, _) in enumerate(files):
            variables[file_name] = f'f{i}'
            lines.append(f"import f{i} from './packs/master/{file_name}.json';")
        lines += ['', 'export const MASTER_PACKS = [']
        for pack_id, spoken, file_name, key in packs:
            lines.append(f"  {{ id: '{pack_id}', spokenName: '{spoken}', name: '{pack_id}', raw: {variables[file_name]}.{key} }},")
        lines += ['];', '']
        return '\n'.join(lines)

    SKILL_CATALOG.write_text(catalog())
    HARNESS_CATALOG.write_text(catalog())

    model = json.loads(MODEL.read_text())
    language = model['interactionModel']['languageModel']
    types = {t['name']: t for t in language['types']}
    commands = {s.lower() for i in language['intents'] if i['name'] not in ('AnswerEntityIntent', 'OpenPackIntent') for s in i['samples']}

    pack_names = types['PACK_NAME']['values']
    pack_names[:] = [v for v in pack_names if not v['id'].startswith('master-')]
    for pack_id, spoken, _, _ in packs:
        pack_names.append({'id': pack_id, 'name': {'value': spoken}})

    answers = types['ANSWER_ENTITY']['values']
    have = {v['name']['value'] for v in answers}
    clashes = set()
    for _, rounds in files:
        for question in [q for questions in rounds.values() for q in questions]:
            for phrases in question['dynamic_entities'].values():
                for phrase in (p.lower() for p in phrases):
                    if not SPEAKABLE.match(phrase) or phrase in have:
                        continue
                    if phrase in commands:
                        clashes.add(phrase)
                        continue
                    answers.append({'name': {'value': phrase}})
                    have.add(phrase)
    MODEL.write_text(json.dumps(model, indent=2, ensure_ascii=False) + '\n')

    sizes = {(f, k): len(q) for f, rounds in files for k, q in rounds.items()}
    print(f'{len(files)} files, {len(packs)} packs, {sum(sizes.values())} questions')
    for pack_id, spoken, file_name, key in packs:
        print(f'  {pack_id:50} {sizes[(file_name, key)]:4}  "{spoken}"')
    print(f'{len(skipped)} rows skipped')
    for line in skipped:
        print('  ' + line)
    if clashes:
        print('answers that are also command samples, left out of the model:', sorted(clashes))
    print(f'model: PACK_NAME {len(pack_names)} values, ANSWER_ENTITY {len(answers)} values, {MODEL.stat().st_size} bytes')


main()
