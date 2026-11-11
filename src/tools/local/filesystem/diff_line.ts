import type { DiffLineKind } from './diff_line_kind';

export type DiffLine = {
  kind: DiffLineKind;
  content: string;
};
