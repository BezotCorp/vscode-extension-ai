export type ContextFile = {
	path: string;
	languageId: string;
	// Absent when the content is withheld: the model sees that the file exists and must ask (read_file) to read it.
	content?: string;
	withheld?: 'protected';
};
