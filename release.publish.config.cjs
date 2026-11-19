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
        publishCmd: 'for file in *.vsix; do pnpm exec vsce publish --oidc --packagePath "$file" && pnpm exec ovsx publish "$file" --trusted-publishing || exit 1; done',
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
