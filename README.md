# Question Tester Alexa Skill

Tests whether Alexa accepts the answers in a trivia question pack. Koyal, the test harness, plays the user: it speaks each accepted answer to a real Echo, and this skill says which option it accepted.

The skill holds every pack in `src/data/catalog.ts`. Koyal chooses which one a test runs by saying its name.

## How it works

```
Koyal (laptop speakers) ──► Echo ──► Alexa ──► Lambda (this repo) ──► CloudWatch logs, read by Koyal when the run ends
                                                  │
                                                  └──► DynamoDB (progress per Alexa user)
```

1. "Alexa, ask question tester to open batch seven science" starts that pack, using its `spokenName` in `src/data/catalog.ts`, and goes straight to a question. Plain "open question tester" resumes the saved pack, or starts brands. Alexa reads it with its options, and sends that question's accepted answers to Alexa as dynamic entities.
2. Alexa replies to each answer with only the option and result, and stays on the question.
3. "Next question" moves on. After the last question, the test is finished.

| You say | Alexa says |
|---|---|
| An answer for the correct option | "Option A. Correct." |
| An answer for another option | "Option B. Incorrect." |
| An answer shared between options | "That matches options A and B." |
| Anything else | "That doesn't match any option." |

The skill doesn't know what the user will say next, or when a question is done. That plan belongs to Koyal.

Other commands: "repeat the question", "previous question", "go to question 12", "start over", "end the test", "stop". Stopping ends the test, so the next open starts at the first question. If the Alexa session drops without a stop, opening the skill continues from the same question.

| Path | Purpose |
|---|---|
| `src/data/packs/` | The question packs, listed in `src/data/catalog.ts`. Validated when the Lambda loads. |
| `src/services/` | Pack parsing and dynamic entities, session state, attempt reports, screen data. |
| `src/handlers/` | Alexa intent handlers. |
| `src/apl/` | Echo Show screens. |
| `src/utils/` | Spoken text, slot parsing, response building. |
| `skill-package/` | Skill manifest and interaction model. |
| `infrastructure/template.yaml` | Lambda and DynamoDB (AWS SAM). |

## Reports to Koyal

The skill doesn't call Koyal. Each answer is written to the Lambda's log as one JSON line:

```json
{ "event": "attemptReport", "runId": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "packId": "brands", "questionId": "1", "questionIndex": 0, "totalQuestions": 47, "attemptIndex": 0, "heard": "papa john's", "intent": "AnswerEntityIntent", "resolutions": [{ "source": "dynamic", "status": "ER_SUCCESS_MATCH", "values": [{ "id": "option_a", "name": "papa john's" }] }], "matchedOptions": ["A"], "correct": true, "response": "Option A. Correct.", "atUtc": "2026-11-04T10:00:00.000Z" }
```

`correct` is null unless exactly one option matched. When a run ends, Koyal reads these lines, builds the report, and pushes it to the Google Sheet. Koyal's AWS key needs `logs:FilterLogEvents` on this Lambda's log group.

An option with an empty accepted-answer list accepts its own text. Batch files keep their questions under `TEXT_QUESTIONS`.

## Changing a pack

Replace the JSON in `src/data/packs/`, and list a new file in `src/data/catalog.ts`. Add the pack's accepted answers to `ANSWER_ENTITY` in the interaction model, without option IDs: they train Alexa's recognition, while the dynamic entities still decide the option. A test fails if any are missing. Copy the same file to the koyal-harness repo, use the same pack ID and `spokenName` in its `PACKS`, and add the name to `PACK_NAME` in the interaction model. A saved test is discarded if the pack's ID or question count changes.

Every batch of `master-trivia-questions-and-answer-slots.xlsx` is imported by a script into `src/data/packs/master/master-<batch>-<category>.json`, in the same format as `batch_7/` (`TEXT_QUESTIONS`, `IMAGE_QUESTIONS`, `AUDIO_QUESTIONS`). Each non-empty list is a pack with the file's name, plus `-image` or `-audio`, opened by saying "master" and the batch and category, such as "master batch seven science". The script writes the files and a generated catalog to both repos, and adds the pack names and answers to the interaction model. The older packs are left as they are. All imported questions are active. Rerun it after the sheet changes:

```bash
uv run --with openpyxl python -I scripts/import-master-sheet.py master-trivia-questions-and-answer-slots.xlsx ../koyal-harness
```

Fetching from S3 is planned.

## Development

```bash
npm install
npm test
npm run build
```

## Deploy

Requires the AWS SAM CLI, the ASK CLI (`npm i -g ask-cli`, then `ask configure`) and valid AWS credentials.

```bash
npm run build
sam deploy --template-file infrastructure/template.yaml --stack-name question-tester --capabilities CAPABILITY_IAM --resolve-s3 --no-confirm-changeset --parameter-overrides SkillId=<skill-id> EvaluatorMode=mock KoyalBaseUrl=unused KoyalApiToken=unused
ask smapi set-interaction-model --skill-id <skill-id> --stage development --locale en-US --interaction-model "file:skill-package/interactionModels/custom/en-US.json"
```

For a new skill, create it first in the [Alexa developer console](https://developer.amazon.com/alexa/console/ask) with "Provision your own" hosting. Then put the `SkillFunctionArn` stack output in `skill-package/skill.json` and upload it with `ask smapi update-skill-manifest`.

## Limitations

- **Only `en-US` is included.** The Echo must use that locale.
