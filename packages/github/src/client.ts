import { Octokit } from 'octokit';

export const githubClient: Octokit = new Octokit(
  process.env.GITHUB_TOKEN ? { auth: process.env.GITHUB_TOKEN } : undefined,
);
