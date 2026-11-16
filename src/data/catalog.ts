import animals from './packs/animals.json';
import batch7Animals from './packs/batch_7/animals.json';
import batch7Arts from './packs/batch_7/arts-and-entertainment.json';
import batch7GeneralKnowledge from './packs/batch_7/general-knowledge.json';
import batch7Geography from './packs/batch_7/geography.json';
import batch7History from './packs/batch_7/history.json';
import batch7Science from './packs/batch_7/science.json';
import batch7Sports from './packs/batch_7/sports.json';
import brands from './packs/brands.json';
import geography from './packs/geography.json';
import movies from './packs/movies.json';
import { parsePack } from '../services/pack.service';
import { MASTER_PACKS } from './master-catalog';

/** Must match PACKS in the koyal-harness repo: Koyal opens a pack by saying its spokenName, which is also a value of PACK_NAME in the interaction model. Batch files keep their questions under TEXT_QUESTIONS. */
export const PACKS = [
  parsePack({ id: 'brands', spokenName: 'pack questions brands', name: 'packQuestions/brands', raw: brands }),
  parsePack({ id: 'animals', spokenName: 'pack questions animals', name: 'packQuestions/animals', raw: animals }),
  parsePack({ id: 'geography', spokenName: 'pack questions geography', name: 'packQuestions/geography', raw: geography }),
  parsePack({ id: 'movies', spokenName: 'pack questions movies', name: 'packQuestions/movies', raw: movies }),
  parsePack({ id: 'batch_7/animals', spokenName: 'batch seven animals', name: 'batch_7/animals', raw: batch7Animals.TEXT_QUESTIONS }),
  parsePack({ id: 'batch_7/arts-and-entertainment', spokenName: 'batch seven arts and entertainment', name: 'batch_7/arts-n-entertainment', raw: batch7Arts.TEXT_QUESTIONS }),
  parsePack({ id: 'batch_7/general-knowledge', spokenName: 'batch seven general knowledge', name: 'batch_7/GK', raw: batch7GeneralKnowledge.TEXT_QUESTIONS }),
  parsePack({ id: 'batch_7/geography', spokenName: 'batch seven geography', name: 'batch_7/geography', raw: batch7Geography.TEXT_QUESTIONS }),
  parsePack({ id: 'batch_7/history', spokenName: 'batch seven history', name: 'batch_7/history', raw: batch7History.TEXT_QUESTIONS }),
  parsePack({ id: 'batch_7/science', spokenName: 'batch seven science', name: 'batch_7/science', raw: batch7Science.TEXT_QUESTIONS }),
  parsePack({ id: 'batch_7/sports', spokenName: 'batch seven sports', name: 'batch_7/sports', raw: batch7Sports.TEXT_QUESTIONS }),
  // Every batch of the master sheet, as master-batch_<n>-<category> packs. Regenerate with scripts/import-master-sheet.py.
  ...MASTER_PACKS.map(parsePack),
];
