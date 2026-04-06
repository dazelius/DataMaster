import simpleGit, { type SimpleGit, type LogResult } from 'simple-git';
import { existsSync, mkdirSync, rmSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { GitRepoConfig, GitCommit, GitStatus, GitSyncResult, GitDiff, GitFileChange } from '@datamaster/shared';

export class GitService {
  private repos: Map<string, { config: GitRepoConfig; git: SimpleGit }> = new Map();

  registerRepo(repoConfig: GitRepoConfig): void {
    mkdirSync(repoConfig.localDir, { recursive: true });
    const git = simpleGit(repoConfig.localDir);
    this.repos.set(repoConfig.id, { config: repoConfig, git });
  }

  private getRepo(repoId: string) {
    const repo = this.repos.get(repoId);
    if (!repo) throw new Error(`Repository '${repoId}' not registered`);
    return repo;
  }

  private buildAuthUrl(url: string, token?: string): string {
    if (!token) return url;
    const parsed = new URL(url);
    parsed.username = 'oauth2';
    parsed.password = token;
    return parsed.toString();
  }

  private async cloneRepo(authUrl: string, localDir: string, shallow?: boolean): Promise<void> {
    const opts = shallow ? ['--depth', '1', '--single-branch'] : [];
    await simpleGit().clone(authUrl, localDir, opts);
  }

  async sync(repoId: string): Promise<GitSyncResult> {
    const { config: cfg } = this.getRepo(repoId);
    const authUrl = this.buildAuthUrl(cfg.url, cfg.token);

    try {
      const gitDir = `${cfg.localDir}/.git`;
      const isRepo = existsSync(gitDir);

      if (isRepo) {
        const healthy = await this.isRepoHealthy(cfg.localDir);
        if (!healthy) {
          rmSync(cfg.localDir, { recursive: true, force: true });
          mkdirSync(cfg.localDir, { recursive: true });
          await this.cloneRepo(authUrl, cfg.localDir, cfg.shallow);
          this.repos.set(repoId, { config: cfg, git: simpleGit(cfg.localDir) });
          return { repoId, success: true, message: 'Re-cloned (previous repo was corrupted)' };
        }
      }

      if (!isRepo) {
        mkdirSync(cfg.localDir, { recursive: true });
        await this.cloneRepo(authUrl, cfg.localDir, cfg.shallow);
        this.repos.set(repoId, { config: cfg, git: simpleGit(cfg.localDir) });
        return { repoId, success: true, message: `Cloned successfully${cfg.shallow ? ' (shallow)' : ''}` };
      }

      const { git } = this.getRepo(repoId);
      if (cfg.shallow) {
        await git.fetch(['--depth', '1']);
        await git.reset(['--hard', 'origin/HEAD']);
        return { repoId, success: true, message: 'Updated (shallow pull)' };
      }

      await git.fetch();
      const status = await git.status();
      if (status.behind > 0) {
        await git.pull();
        return { repoId, success: true, message: `Pulled ${status.behind} commits`, commitsBehind: status.behind };
      }

      return { repoId, success: true, message: 'Already up to date' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      const shouldNukeAndReclone =
        msg.includes('cannot lock ref') || msg.includes('.lock') ||
        msg.includes('spawn') || msg.includes('broken') || msg.includes('Aborted');

      if (shouldNukeAndReclone) {
        // Try lock cleanup first for lock-related errors
        if (msg.includes('cannot lock ref') || msg.includes('.lock')) {
          try {
            this.cleanLockFiles(cfg.localDir);
            const { git } = this.getRepo(repoId);
            await git.raw(['gc', '--prune=now']);
            await git.raw(['remote', 'prune', 'origin']);
            if (cfg.shallow) {
              await git.fetch(['--depth', '1']);
              await git.reset(['--hard', 'origin/HEAD']);
            } else {
              await git.fetch(['--prune']);
              const status = await git.status();
              if (status.behind > 0) await git.pull();
            }
            return { repoId, success: true, message: 'Updated (after lock cleanup)' };
          } catch { /* lock cleanup failed, fall through to re-clone */ }
        }

        try {
          rmSync(cfg.localDir, { recursive: true, force: true });
          mkdirSync(cfg.localDir, { recursive: true });
          await this.cloneRepo(authUrl, cfg.localDir, cfg.shallow);
          this.repos.set(repoId, { config: cfg, git: simpleGit(cfg.localDir) });
          return { repoId, success: true, message: `Re-cloned${cfg.shallow ? ' (shallow)' : ''} after error` };
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          return { repoId, success: false, message: `Re-clone failed: ${retryMsg}` };
        }
      }

      return { repoId, success: false, message: msg };
    }
  }

  private cleanLockFiles(localDir: string): void {
    const gitDir = join(localDir, '.git');
    if (!existsSync(gitDir)) return;

    const lockFile = join(gitDir, 'index.lock');
    if (existsSync(lockFile)) unlinkSync(lockFile);

    const refsDir = join(gitDir, 'refs');
    if (existsSync(refsDir)) this.removeLockFilesRecursive(refsDir);
  }

  private removeLockFilesRecursive(dir: string): void {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          this.removeLockFilesRecursive(fullPath);
        } else if (entry.name.endsWith('.lock')) {
          unlinkSync(fullPath);
        }
      }
    } catch { /* ignore fs errors */ }
  }

  private async isRepoHealthy(localDir: string): Promise<boolean> {
    try {
      const git = simpleGit(localDir);
      await git.status();
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(repoId: string): Promise<GitStatus> {
    const { git } = this.getRepo(repoId);
    try {
      const status = await git.status();
      return {
        repoId,
        branch: status.current ?? 'unknown',
        lastSync: Date.now(),
        ahead: status.ahead,
        behind: status.behind,
        isClean: status.isClean(),
      };
    } catch {
      return { repoId, branch: 'unknown', lastSync: null, ahead: 0, behind: 0, isClean: true };
    }
  }

  async getLog(repoId: string, limit = 50, skip = 0): Promise<{ commits: GitCommit[]; total: number }> {
    const { git } = this.getRepo(repoId);
    const log: LogResult = await git.log({ maxCount: limit, '--skip': skip });

    const commits: GitCommit[] = log.all.map((entry) => ({
      hash: entry.hash,
      hashShort: entry.hash.substring(0, 7),
      author: entry.author_name,
      email: entry.author_email,
      date: entry.date,
      message: entry.message,
    }));

    return { commits, total: log.total };
  }

  async getDiff(repoId: string, fromCommit: string, toCommit: string): Promise<GitDiff> {
    const { git } = this.getRepo(repoId);
    const diffSummary = await git.diffSummary([fromCommit, toCommit]);

    const files: GitFileChange[] = diffSummary.files.map((f) => {
      const ins = 'insertions' in f ? (f as any).insertions : 0;
      const del = 'deletions' in f ? (f as any).deletions : 0;
      const isBinary = 'binary' in f && (f as any).binary;
      return {
        path: f.file,
        status: isBinary ? 'modified' : ins > 0 && del === 0 ? 'added' : del > 0 && ins === 0 ? 'deleted' : 'modified',
        additions: ins,
        deletions: del,
      } satisfies GitFileChange;
    });

    const patch = await git.diff([fromCommit, toCommit]);

    return { fromCommit, toCommit, files, patch };
  }

  async getFileContent(repoId: string, filePath: string, commit?: string): Promise<string> {
    const { git } = this.getRepo(repoId);
    const ref = commit ?? 'HEAD';
    return git.show([`${ref}:${filePath}`]);
  }

  async getFileList(repoId: string, commit?: string): Promise<string[]> {
    const { git } = this.getRepo(repoId);
    const ref = commit ?? 'HEAD';
    const result = await git.raw(['ls-tree', '-r', '--name-only', ref]);
    return result.trim().split('\n').filter(Boolean);
  }

  getRegisteredRepoIds(): string[] {
    return [...this.repos.keys()];
  }
}

export const gitService = new GitService();
