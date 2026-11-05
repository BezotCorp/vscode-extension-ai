export type Decoding = {
	format: 'json' | 'text' | 'binary' | 'none';
	ok: boolean;
	error?: string;
};
