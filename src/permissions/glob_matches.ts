// A pattern without wildcards names a file or folder: it covers itself and everything below it.
export function globMatches(pattern: string, target: string): boolean {
	const body = pattern
		.split(/(\*\*\/?|\*|\?)/)
		.map((part) => {
			if (part === "**/" || part === "**") {
				return ".*";
			}

			if (part === "*") {
				return "[^/\\\\]*";
			}

			return part === "?"
				? "[^/\\\\]"
				: part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
		})
		.join("");
	const hasWildcard = /[*?]/.test(pattern);

	return new RegExp(`^${body}${hasWildcard ? "" : "(?:[/\\\\].*)?"}$`).test(
		target,
	);
}
