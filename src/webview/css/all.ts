export function getAllStyles(): string {
  return `
* {
  box-sizing: border-box;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}
`;
}
