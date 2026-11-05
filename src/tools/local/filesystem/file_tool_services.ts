import { WriteFilePipeline } from "./write_file_pipeline";

// What the file tools share for the whole life of the extension, beyond a single generation: the persistent write
// pipeline. What the model received of each file is not here: it is only true for one generation (see FileVersionTracker).
export class FileToolServices {
	readonly writes: WriteFilePipeline;

	constructor(storagePath: string) {
		this.writes = new WriteFilePipeline(storagePath);
	}

	dispose(): void {
		this.writes.dispose();
	}
}
