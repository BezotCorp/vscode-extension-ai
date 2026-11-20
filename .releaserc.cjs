'use strict';

const phase = process.env.BEZOTCORP_RELEASE_PHASE;

switch (phase) {
  case 'package':
    module.exports = require('./release.package.config.cjs');
    break;

  case 'publish':
    module.exports = require('./release.publish.config.cjs');
    break;

  default:
    throw new Error(
      `Invalid release phase: ${phase ?? 'undefined'}`,
    );
}
