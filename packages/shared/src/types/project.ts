import type { GitRepoConfig } from './git.js';

export interface JiraConfig {
  baseUrl: string;
  userEmail: string;
  apiToken: string;
  defaultProject: string;
}

export interface ConfluenceConfig {
  baseUrl: string;
  userEmail: string;
  apiToken: string;
}

export interface SlackConfig {
  botToken: string;
  appToken: string;
}

export interface ProjectConfig {
  id: string;
  name: string;
  gitRepos: GitRepoConfig[];
  dataPath: string;
  schemaPath: string;
  integrations: {
    jira?: JiraConfig;
    confluence?: ConfluenceConfig;
    slack?: SlackConfig;
  };
}
