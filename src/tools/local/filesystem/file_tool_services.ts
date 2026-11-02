import { FileVersionTracker } from './file_version_tracker';
import { WriteFilePipeline } from './write_file_pipeline';

// What the file tools share for the whole life of the extension, beyond a single generation.
export class FileToolServices {
  readonly versions = new FileVersionTracker();
  readonly writes: WriteFilePipeline;

  constructor(storagePath: string) {
    this.writes = new WriteFilePipeline(storagePath);
  }

  dispose(): void {
    this.writes.dispose();
  }
}
