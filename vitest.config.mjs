import { configDefaults, defineConfig } from 'vitest/config';

// These suites start real programs (git, an MCP server) or run the file tools against a real folder through a fake
// `vscode` that uses POSIX paths, `sh` and symbolic links. They are verified on Linux only; on Windows they are left
// out until the fake is made to follow Windows paths, so that the rest of the suite still runs there.
const posixOnly = [
  'src/mcp/tests/**',
  'src/tools/local/git/tests/**',
  'src/tools/local/filesystem/tests/file_tools_*.test.ts',
  'src/tools/local/filesystem/tests/write_file_pipeline.test.ts',
  'src/tools/tests/default_tools.test.ts',
  'src/workspace/tests/detect_structural_workspace.test.ts',
  'src/workspace/tests/open_document.test.ts',
  'src/workspace/tests/resolve_path.test.ts',
];

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ...(process.platform === 'win32' ? posixOnly : [])],
  },
});
