import { Pronunciation } from './types';

/** A reader-only snapshot. Never attached to the shared hover QueryResult. */
export interface LearningMeaning {
  text: string;
  basis: 'library' | 'dictionary' | 'inferred' | 'missing';
  source: string;
  review_status?: 'unreviewed' | 'confirmed';
  context?: string;
}
export interface LearningExpansion {
  text: string;
  inferred: boolean;
  words: LearningItem[];
}
export interface LearningBranch {
  meanings: LearningMeaning[];
  pronunciation?: Pronunciation;
  expansion?: LearningExpansion;
  context?: string;
  rule?: Readonly<Record<string, unknown>>;
  applicable?: boolean;
}
export interface LearningItem {
  id: string;
  text: string;
  meanings: LearningMeaning[];
  pronunciation?: Pronunciation;
  branches: LearningBranch[];
  dictionaryMeanings: LearningMeaning[];
  prefix?: boolean;
  numeric?: boolean;
}
export interface PanelLearning {
  state: 'loading' | 'ready' | 'unavailable';
  symbol: string;
  items: LearningItem[];
  diagnostics: string[];
}
