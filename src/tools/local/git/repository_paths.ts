// Paths inside the repository, as absolute paths (for permission checks) and as literal pathspecs for git.
export type RepositoryPaths = {
	absolute: string[];
	pathspecs: string[];
};
