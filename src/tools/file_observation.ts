import type { FileObservationOrigin } from './file_observation_origin';

// What the file tools remembered, during one tool call, of what the model knows of a file. It is a record of the
// past, kept with the call that produced it: it says nothing about what a later request really contains.
// `sha` is the SHA-256 of the whole file at that time. `text` is exactly what reached the model, and is only kept when
// that is not the whole file: a whole view is found again from the file itself, checked against `sha`. No position
// in the file is recorded, because none is known. It never reaches the model.
export type FileObservation = {
  path: string;
  sha: string;
  complete: boolean;
  origin: FileObservationOrigin;
  text?: string;
};
