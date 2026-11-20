module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      'semantic-release-vsce',
      {
        packageVsix: false,
        publish: false,
      },
    ],
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          'set -e; for file in *.vsix; do case "$file" in *@linux-x64.vsix) target=linux-x64 ;; *@win32-x64.vsix) target=win32-x64 ;; *@*.vsix) echo "Unexpected VSIX target: $file" >&2; exit 1 ;; *) target=universal ;; esac; pnpm exec vsce publish --oidc --skip-duplicate --packagePath "$file"; if [ "$target" = universal ]; then pnpm exec ovsx publish "$file" --trusted-publishing --skip-duplicate; else pnpm exec ovsx publish "$file" --target "$target" --trusted-publishing --skip-duplicate; fi; done',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        message: 'chore: release ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: '*.vsix',
      },
    ],
  ],
};
