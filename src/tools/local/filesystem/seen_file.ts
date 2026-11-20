import type { Segment } from './segment';

// What the model received of one file: the SHA of the whole file when it was read, whether the model got all of it,
// and the parts it really got. None of it reaches the model.
export type SeenFile = {
  sha: string;
  complete: boolean;
  segments: Segment[];
};
