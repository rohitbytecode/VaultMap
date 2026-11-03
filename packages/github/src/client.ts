import { Octokit } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';

const ThrottledOctokit = Octokit.plugin(throttling);

export function createGitHubClient(token?: string): Octokit {
  return new ThrottledOctokit({
    ...(token ? { auth: token } : {}),
    throttle: {
      onRateLimit: (_retryAfter, options) => {
        console.warn(
          `Request quota exhausted for request ${options.method} ${options.url}`,
        );
        return false;
      },
      onSecondaryRateLimit: (_retryAfter, options) => {
        console.warn(
          `Request quota exhausted for request ${options.method} ${options.url}`,
        );
        return false;
      },
    },
  });
}
