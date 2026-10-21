export type Align = 'left' | 'center' | 'right' | 'justify';

export interface RunProps {
  font?: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface ParaProps {
  spaceBefore?: number;
  spaceAfter?: number;
  lineSpacing?: number;
  align?: Align;
  indentLeft?: number;
  indentRight?: number;
  keepWithNext?: boolean;
  outlineLevel?: number;
}

export interface Style {
  type: 'paragraph' | 'character' | 'table' | 'numbering';
  name: string;
  basedOn: string | null;
  next: string;
  run?: RunProps;
  para?: ParaProps;
  table?: Record<string, unknown>;
}

export interface TextRun {
  type: 'text';
  text: string;
  marks?: Record<string, unknown>;
}

export interface Block {
  type: string;
  id: string;
  style?: string;
  section?: string;
  content?: TextRun[];
}

export interface Section {
  id: string;
  page: { size: string; width: number; height: number; orientation: 'portrait' | 'landscape' };
  margins: { top: number; right: number; bottom: number; left: number; header: number; footer: number; gutter: number };
  columns: { count: number; gap: number };
  headers: Record<string, unknown>;
  footers: Record<string, unknown>;
  titlePage: boolean;
  start: string;
  pageNumberStart?: number;
  pageNumberFormat?: string;
  pageColor?: string;
  pageBorder?: string;
}

export interface DocTab {
  id: string;
  title: string;
  parent: string | null;
  body: Block[];
}

export interface FtxtDocument {
  format: 'ftxt';
  formatVersion: number;
  id: string;
  title: string;
  meta: { author: string; created: number; modified: number; subject: string; keywords: string[]; language: string };
  settings: { pageless: boolean; defaultTab: number; trackChanges: boolean };
  styles: Record<string, Style>;
  numbering: Record<string, unknown>;
  sections: Section[];
  tabs: DocTab[];
  notes: { footnotes: Record<string, unknown>; endnotes: Record<string, unknown> };
  comments: Record<string, unknown>;
  media: Record<string, unknown>;
  variables?: Record<string, string>;
}

export interface DocSummary {
  id: string;
  title: string;
  modified: number;
  created: number;
  words: number;
  bytes: number;
  deletedAt?: number;
  locked?: boolean;
}
