export interface RepositoryFileContent {
  path: string;
  name: string;
  extension: string | null;
  content: string;
  size: number;
  encoding: string;
}
