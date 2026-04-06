export interface GitRepoConfig {
  id: string;
  url: string;
  token?: string;
  localDir: string;
  label: string;
  /** Use shallow clone (--depth 1) to save disk space and time */
  shallow?: boolean;
}

export interface GitCommit {
  hash: string;
  hashShort: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface GitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

export interface GitDiff {
  fromCommit: string;
  toCommit: string;
  files: GitFileChange[];
  patch?: string;
}

export interface GitStatus {
  repoId: string;
  branch: string;
  lastSync: number | null;
  ahead: number;
  behind: number;
  isClean: boolean;
}

export interface GitSyncResult {
  repoId: string;
  success: boolean;
  message: string;
  commitsBehind?: number;
}
