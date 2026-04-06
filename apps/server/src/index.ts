import { resolve } from 'path';
import { buildApp } from './app.js';
import { config } from './config.js';
import { initializeDb } from './db/client.js';
import { gitService } from './services/git/gitService.js';
import { loadGameData, invalidateCache } from './services/data/dataService.js';
import { wikiService } from './services/wiki/wikiService.js';
import { initServerQueryEngine, registerStringDataTables } from './services/data/serverQueryEngine.js';
import * as stringDataService from './services/google/stringDataService.js';
import * as googleSheets from './services/google/googleSheetsService.js';

function registerRepos() {
  const baseDir = resolve(config.GIT_CLONE_BASE_DIR);

  if (config.GITLAB_REPO_URL) {
    gitService.registerRepo({
      id: 'data',
      url: config.GITLAB_REPO_URL,
      token: config.GITLAB_TOKEN || undefined,
      localDir: resolve(baseDir, 'data'),
      label: 'Game Data',
    });
  }

  if (config.GITLAB_REPO2_URL) {
    gitService.registerRepo({
      id: 'code',
      url: config.GITLAB_REPO2_URL,
      token: config.GITLAB_REPO2_TOKEN || undefined,
      localDir: resolve(baseDir, 'code'),
      label: 'Game Code',
      shallow: true,
      branch: 'develop',
      sparsePatterns: [
        '*.cs', '*.lua', '*.json', '*.xml', '*.yaml', '*.yml',
        '*.txt', '*.md', '*.cfg', '*.ini', '*.toml',
        '*.shader', '*.hlsl', '*.cginc', '*.compute',
        '*.asmdef', '*.asmref', '*.proto',
        '*.png',
      ],
    });
  }
}

async function syncAndLoad(logger: { info: (msg: string) => void; warn: (msg: string) => void }) {
  const repoIds = gitService.getRegisteredRepoIds();
  if (repoIds.length === 0) {
    logger.warn('No Git repositories configured — skipping sync');
    return;
  }

  logger.info(`Syncing ${repoIds.length} repo(s)...`);

  for (const id of repoIds) {
    gitService.sync(id).then((r) => {
      if (r.success) {
        logger.info(`[${r.repoId}] ${r.message}`);
      } else {
        logger.warn(`[${r.repoId}] sync failed: ${r.message}`);
      }

      if (r.repoId === 'data' && r.success) {
        loadDataFromRepo(logger).then(() => {
          initServerQueryEngine();
          logger.info('Server-side query engine initialized');
        });
      }
    });
  }
}

async function loadDataFromRepo(logger: { info: (msg: string) => void; warn: (msg: string) => void }) {
  const dataRepoDir = resolve(config.GIT_CLONE_BASE_DIR, 'data');
  try {
    invalidateCache();
    await loadGameData(dataRepoDir, config.REPO_SCHEMA_SUBPATH, config.REPO_DATA_SUBPATH);
    logger.info('Game data loaded successfully');
  } catch (err) {
    logger.warn(`Failed to load game data: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  initializeDb();
  registerRepos();
  await wikiService.ensureDir();

  const app = await buildApp();

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`DataMaster server running on http://localhost:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  if (config.AUTO_SYNC_ON_START) {
    syncAndLoad(app.log).catch((err) => app.log.error(err));
  }

  if (googleSheets.isConfigured()) {
    loadStringData(app.log);
  } else {
    app.log.warn('Google Sheets not configured — StringData disabled');
  }
}

async function loadStringData(logger: { info: (msg: string) => void; warn: (msg: string) => void }) {
  try {
    await stringDataService.loadStringData();
    registerStringDataTables();
    logger.info('StringData loaded from Google Sheets');
    stringDataService.setOnReloadCallback(() => {
      registerStringDataTables();
      logger.info('StringData tables refreshed after auto-sync');
    });
    stringDataService.startAutoSync();
  } catch (err) {
    logger.warn(`Failed to load StringData: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();
