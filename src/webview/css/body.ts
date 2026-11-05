export function getBodyStyles(): string {
	return `
html,
body {
  width: 100%;
  height: 100%;
}

body {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--vscode-foreground);
  background: var(--vscode-sideBar-background);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}
`;
}
