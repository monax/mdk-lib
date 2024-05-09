import { join } from 'node:path';
import { config } from 'dotenv';
import type { NodeEnv } from 'mdk-schema/dist/environment.js';

/**
 * Load .env files from package directory. Path a reliable absolute path (i.e. ideally not process.cwd()) so that
 * sourcing environment variables can work from different running context (e.g. from an IDE). We should also contain
 * the places we are reading environment variables so that we can reason based on the config object which can be
 * overridden in tests etc rather than calls to process.env littered throughout the code
 *
 * @param packageDir the root directory containing the env fiels
 */
export function dotenv(packageDir: string) {
  if ((process.env.NODE_ENV as NodeEnv) !== 'production') {
    // This is expected to be a symlink to global config
    const envPath = join(packageDir, '.env');
    // Allow for package-specific values and overrides that don't pollute the global vars
    const packageEnvPath = join(packageDir, 'package.env');
    // Allow for personal overrides that don't pollute the global vars
    const developmentEnvPath = join(packageDir, '.env.development');
    // dotenv will only override variables that are not set first therefore we source package.env first to take
    // precedent over .env
    config({ path: developmentEnvPath });
    config({ path: packageEnvPath });
    config({ path: envPath });
  }
}
