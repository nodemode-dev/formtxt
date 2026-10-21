export type Category = 'spelling' | 'grammar' | 'clarity' | 'conciseness' | 'formality' | 'inclusiveness';

export const CATEGORIES: Category[] = ['spelling', 'grammar', 'clarity', 'conciseness', 'formality', 'inclusiveness'];

export const CATEGORY_LABEL: Record<Category, string> = {
  spelling: 'Spelling',
  grammar: 'Grammar',
  clarity: 'Clarity',
  conciseness: 'Conciseness',
  formality: 'Formality',
  inclusiveness: 'Inclusiveness',
};

export interface Fix {
  label: string;
  from: number;
  to: number;
  text: string;
}

export interface RawIssue {
  from: number;
  to: number;
  cat: Category;
  rule: string;
  message: string;
  fixes: Fix[];
}

export interface Issue extends RawIssue {
  text: string;
  para: string;
  nth: number;
  lang: string;
}

export interface GrammarRules {
  repeated: boolean;
  article: boolean;
  capital: boolean;
  spaces: boolean;
  punctuation: boolean;
  long: boolean;
  passive: boolean;
  wordy: boolean;
  confusion: boolean;
  formal: boolean;
  inclusive: boolean;
  vocabulary: boolean;
}

export const RULE_LABELS: Record<keyof GrammarRules, string> = {
  repeated: 'Repeated words',
  article: 'A or an before a vowel sound',
  capital: 'Sentence starting with a lowercase letter',
  spaces: 'Extra spaces',
  punctuation: 'Spacing around punctuation',
  long: 'Very long sentences',
  passive: 'Passive voice',
  wordy: 'Wordy phrases',
  confusion: 'Its and it\'s, their and there, then and than',
  formal: 'Formal writing: contractions, slang and casual words',
  inclusive: 'Inclusive language: gendered and exclusionary terms',
  vocabulary: 'Vocabulary: vague intensifiers and cliches',
};

export interface AutoCorrectRules {
  list: boolean;
  smartQuotes: boolean;
  dashes: boolean;
  symbols: boolean;
  arrows: boolean;
  fractions: boolean;
  capitalize: boolean;
  ellipsis: boolean;
}

export interface AutoCorrectPrefs {
  enabled: boolean;
  rules: AutoCorrectRules;
  entries: Record<string, string>;
  removed: string[];
  disabled: string[];
}

export interface ProofingPrefs {
  dictionary: string[];
  spelling: boolean;
  grammar: boolean;
  grammarRules: GrammarRules;
  autocorrect: AutoCorrectPrefs;
}

export const DEFAULT_PREFS: ProofingPrefs = {
  dictionary: [],
  spelling: true,
  grammar: true,
  grammarRules: { repeated: true, article: true, capital: true, spaces: true, punctuation: true, long: true, passive: true, wordy: true, confusion: true, formal: false, inclusive: true, vocabulary: true },
  autocorrect: {
    enabled: true,
    rules: { list: true, smartQuotes: true, dashes: true, symbols: true, arrows: true, fractions: true, capitalize: false, ellipsis: true },
    entries: {},
    removed: [],
    disabled: [],
  },
};
