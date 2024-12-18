// Therefore those skilled at the unorthodox
// are infinite as heaven and earth,
// inexhaustible as the great rivers.
// When they come to an end,
// they begin again,
// like the days and months;
// they die and are reborn,
// like the four seasons.
//
// - Sun Tsu, The Art of War.
//
// ArthurHub, 2024

import * as fs from 'fs';
import path from 'path';
import { log } from './log.js';
import type { Config } from './config.js';
import { pruneNodeModules } from './node-deps-pruner.js';
import { execa } from 'execa';

interface NpmListOutput {
  name: string;
  dependencies: Record<string, Dependency>;
}

interface Dependency {
  version: string;
  resolved: string;
  dependencies?: Record<string, Dependency>;
}

/**
 * Install prod node_modules of the app in the staging folder.
 */
export async function stageAppNodeModules(config: Config): Promise<void> {
  const topLevelDeps = await getTopLevelNpmModulesExternalDependencies(config);

  const packageJson = {
    name: `${config.appName}-node-modules`,
    dependencies: Object.fromEntries(topLevelDeps),
  };
  log.debug(`Write "package.json": ${log.colorizeJson(packageJson)}`);
  await fs.promises.writeFile(
    path.join(config.appNodeModulesStagingFolder, 'package.json'),
    JSON.stringify(packageJson, null, 2),
  );

  log.debug(`Run npm install..`);
  const { stdout } = await execa('npm.cmd', ['install', '.', '--no-bin-links'], {
    cwd: config.appNodeModulesStagingFolder,
  });
  log.debug(stdout);

  log.debug('Clean-lean node_modules..');
  await pruneNodeModules(config);
}

/**
 * Use "npm ls" to get the top-level external dependencies of the app.
 * i.e. ignore local dependencies (typescript projects) and dev/peer/optional dependencies.
 * Use "package-lock.json" to query npm to make it explicit to the required package. Create (and remove)
 * the package-lock.json file if it doesn't exist using "npm install --package-lock-only".
 */
async function getTopLevelNpmModulesExternalDependencies(config: Config): Promise<Map<string, string>> {
  const packageLockFile = path.join(config.appPackagePath, 'package-lock.json');
  const packageLockFileExists = fs.existsSync(packageLockFile);
  try {
    if (!packageLockFileExists) {
      // if package-lock.json doesn't exist, create it using npm
      log.debug('Run "npm install --package-lock-only [...]"');
      const { stdout } = await execa(
        'npm.cmd',
        ['install', '--package-lock-only', '--omit=dev', '--omit=peer', '--omit=optional'],
        {
          cwd: config.appPackagePath,
        },
      );
      log.debug(stdout);
    }

    // use package-lock-only to find all the prod dependencies of the app
    log.debug('Run "npm ls --package-lock-only [...]"');
    const { stdout: npmLsJsonOutput } = await execa(
      'npm.cmd',
      ['ls', '--package-lock-only', '--omit=dev', '--omit=peer', '--omit=optional', '--depth=0', '--json', '--silent'],
      {
        cwd: config.appPackagePath,
      },
    );

    const npmLs = JSON.parse(npmLsJsonOutput) as NpmListOutput;
    const topLevelDeps = collectTopLevelExternalDependencies(npmLs.dependencies);

    log.debug('Top-level dependencies:', JSON.stringify(Array.from(topLevelDeps)));
    return topLevelDeps;
  } catch (error) {
    throw new Error(`Error getting top-level dependencies`, { cause: error });
  } finally {
    if (!packageLockFileExists) {
      try {
        // remove package-lock.json if it didn't exist before
        log.debug('Remove package-lock.json');
        await fs.promises.rm(packageLockFile, { force: true });
      } catch (error) {
        log.warn(`Error removing package-lock.json: ${error}`);
      }
    }
  }
}

/**
 * Collect all non-local dependencies and return map of dependency name and version
 */
function collectTopLevelExternalDependencies(dependencies: Record<string, Dependency>): Map<string, string> {
  const collectedDeps = new Map<string, string>();
  for (const [name, dependency] of Object.entries(dependencies)) {
    if (!dependency.resolved.startsWith('file:') && !dependency.resolved.startsWith('link:')) {
      collectedDeps.set(name, dependency.version);
    }
    if (dependency.dependencies) {
      for (const [innerName, innerVersion] of collectTopLevelExternalDependencies(dependency.dependencies)) {
        collectedDeps.set(innerName, innerVersion);
      }
    }
  }
  return collectedDeps;
}
