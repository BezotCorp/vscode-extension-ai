import type { FileObservation } from './file_observation';

// One model response that requested tools, with the serialized result the model received for each call.
// `observations` is what the file tools remembered during that call (see FileObservation); it is not part of the result.
export type ToolRound = {
  content: string;
  calls: { name: string; arguments: unknown; result: string; observations?: FileObservation[] }[];
};
