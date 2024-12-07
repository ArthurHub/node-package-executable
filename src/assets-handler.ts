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
import { basename, join } from 'path';
import archiver from 'archiver';
import { logger } from './log.js';

export async function archiveAssets(baseFolder: string, appNodeModulesFolder: string, appPath: string): Promise<void> {
  logger.info('Archive..');
  logger.debug('Archive node executable asset..');
  await archiveNodeExecutable(baseFolder);

  logger.debug('Archive node modules asset..');
  await archiveNodeModules(baseFolder, appNodeModulesFolder);

  logger.debug('Copy bundle asset..');
  const appName = basename(appPath);
  fs.copyFileSync(appPath, join(baseFolder, appName));
}

async function archiveNodeExecutable(baseFolder: string): Promise<void> {
  const output = fs.createWriteStream(join(baseFolder, 'node.zip'));
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });
  archive.pipe(output);

  archive.file(join(baseFolder, 'node.exe'), { name: 'node.exe' });
  await archive.finalize();
}

async function archiveNodeModules(baseFolder: string, appNodeModulesFolder: string): Promise<void> {
  const output = fs.createWriteStream(join(baseFolder, 'node_modules.zip'));
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });
  archive.pipe(output);

  archive.directory(appNodeModulesFolder, false);
  await archive.finalize();
}
