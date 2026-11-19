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
        prepareCmd: 'for file in *.vsix; do pnpm exec vsce publish --oidc --skip-duplicate --packagePath "$file" && pnpm exec ovsx publish "$file" --trusted-publishing --skip-duplicate || exit 1; done',
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
