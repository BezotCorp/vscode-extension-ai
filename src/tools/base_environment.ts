// Variables a program needs to run at all; the same idea as the default environment of the MCP SDK. Programs the
// extension starts on the user's behalf get these, not every variable of the editor (tokens, credentials).
const BASE_ENVIRONMENT = [
  'HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP',
  'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'USERPROFILE', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
  'PROGRAMFILES', 'PROGRAMDATA', 'WINDIR',
];

export function baseEnvironment(additional: string[] = []): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const name of [...BASE_ENVIRONMENT, ...additional]) {
    const value = process.env[name];

    if (value !== undefined && !value.startsWith('()')) {
      environment[name] = value;
    }
  }

  return environment;
}
