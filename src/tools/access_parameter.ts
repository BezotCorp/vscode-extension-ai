// The schema of the `access` argument, shared by the tools that change, create, move or delete files.
export const ACCESS_PARAMETER = {
  type: 'object',
  description:
    'Omit it for an operation inside the current window (the folders opened in the editor). {"kind":"elevated"} when the path is outside the current window. {"kind":"critical","reason":"..."} for a critical location (home folder or its parents, a folder of the current window or its parents, .git, system folders), where reason says why you must write there. A project structure such as a Cargo workspace or a monorepo does not extend the current window. The extension checks the real level itself: announcing a lower level is not an error, but a critical operation without a reason is refused before anything happens.',
  properties: {
    kind: { type: 'string', description: 'normal, elevated or critical.' },
    reason: {
      type: 'string',
      description: 'For critical only: why this critical location must be touched.',
    },
  },
} as const;
