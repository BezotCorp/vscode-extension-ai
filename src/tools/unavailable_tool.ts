// A tool the model is not offered, and why: the model is told, so it can say what it cannot do.
export type UnavailableTool = {
	id: string;
	name: string;
	reason: string;
};
