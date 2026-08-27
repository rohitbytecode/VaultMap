import { RepositoryFileContent } from '@vaultmap/types';

import { githubClient } from './client.js';
const SUPPORTED_ENCODING = 'base64' as const;

export async function getRepositoryFile(
  owner: string,
  name: string,
  path: string,
  branch: string,
): Promise<RepositoryFileContent> {
  const { data } = await githubClient.rest.repos.getContent({
    owner,
    repo: name,
    path,
    ref: branch,
  });

  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`Path does not resolve to a file: "${path}"`);
  }

  if (data.encoding !== SUPPORTED_ENCODING) {
    throw new Error(
      `Cannot decode file "${path}": encoding "${data.encoding}" is not supported.` +
        `Files over 1 MB must be fetched via the Git blobs API.`,
    );
  }

  const content = decodeBase64(data.content);

  const fileName = getFileName(path);

  return {
    path,
    name: fileName,
    extension: getFileExtension(fileName),
    content,
    size: data.size,
    encoding: data.encoding,
  };
}

function decodeBase64(encoded: string): string {
  const cleaned = encoded.replace(/\s/g, '');

  const bytes = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function getFileName(filePath: string): string {
  if (!filePath) return '';
  return filePath.split('/').at(-1) ?? '';
}

function getFileExtension(name: string): string | null {
  const lastDot = name.lastIndexOf('.');

  if (lastDot <= 0) return null;

  return name.slice(lastDot).toLowerCase();
}
