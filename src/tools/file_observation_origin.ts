// How the model came to know a version of a file: it read it, it created it, it changed it itself (the tool checked
// the write), or an update was refused and the current content was handed back.
export type FileObservationOrigin = 'read' | 'created' | 'written' | 'conflict';
