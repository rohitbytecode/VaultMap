import { useState, useMemo, useRef } from 'react';
import { Copy, Check } from 'lucide-react';

import type {
  RepositoryTreeNode,
  RepositoryFileContent,
} from '@vaultmap/types';

import RepositoryTree from './components/RepositoryTree';
import FileViewer from './components/FileViewer';
import { useBackendWakeup } from './hooks/useBackendWakeup';

import './App.css';

function generateTreeText(nodes: RepositoryTreeNode[], prefix = ''): string {
  let text = '';

  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';

    text += `${prefix}${connector}${node.name}${node.type === 'directory' ? '/' : ''}\n`;

    if (node.type === 'directory' && node.children?.length) {
      text += generateTreeText(
        node.children,
        prefix + (isLast ? '    ' : '│   '),
      );
    }
  });

  return text;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Repository {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
}

interface FileEntry {
  path: string;
  name: string;
  extension: string | null;
  size?: number;
}

interface DirectoryEntry {
  path: string;
  name: string;
}

interface ScanResult {
  snapshot: {
    repository: Repository;
    files: FileEntry[];
    directories: DirectoryEntry[];
  };
  statistics: {
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
    extensions: Record<string, number>;
  };
  tree: RepositoryTreeNode[];
}

const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? 'http://localhost:6770'
    : 'https://vaultmap-api.onrender.com')
).replace(/\/+$/, '');
const FILES_PER_PAGE = 100;

function App() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [filePage, setFilePage] = useState(1);
  const [selectedFile, setSelectedFile] =
    useState<RepositoryFileContent | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const wakeup = useBackendWakeup();
  const scanInProgressRef = useRef(false);

  const totalFilePages = result
    ? Math.ceil(result.snapshot.files.length / FILES_PER_PAGE)
    : 0;

  const paginatedFiles = useMemo(() => {
    if (!result) return [];
    const start = (filePage - 1) * FILES_PER_PAGE;
    return result.snapshot.files.slice(start, start + FILES_PER_PAGE);
  }, [result, filePage]);

  async function handleCopyTree() {
    if (!result?.tree) return;
    try {
      await navigator.clipboard.writeText(generateTreeText(result.tree));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard unavailable or permission denied.
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await startScan();
  }

  async function startScan() {
    if (scanInProgressRef.current) return;
    scanInProgressRef.current = true;

    setError('');
    setResult(null);
    setIsScanning(true);
    setFilePage(1);

    try {
      if (!(await wakeup.ensureAwake())) return;

      const response = await fetch(`${API_URL}/api/repositories/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to scan repository');
      }

      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to scan repository',
      );
    } finally {
      scanInProgressRef.current = false;
      setIsScanning(false);
    }
  }

  async function handleFileSelect(path: string) {
    if (!result) return;

    setIsLoadingFile(true);
    setSelectedFile(null);
    setError('');

    const { owner, name, defaultBranch } = result.snapshot.repository;

    try {
      const params = new URLSearchParams({
        owner,
        repository: name,
        path,
        branch: defaultBranch,
      });

      const response = await fetch(
        `${API_URL}/api/repositories/file?${params.toString()}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to load file');
      }

      setSelectedFile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setIsLoadingFile(false);
    }
  }

  return (
    <>
      <main className="app">
        <section className="hero">
          <p className="eyebrow">VAULTMAP</p>

          <h1>Understand any repository.</h1>

          <p className="subtitle">
            Scan a public GitHub repository and explore its structure, files,
            directories, and technology footprint.
          </p>

          <form className="scan-form" onSubmit={handleSubmit}>
            <input
              type="url"
              placeholder="https://github.com/rohitbytecode/bmtech"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />

            <button
              type="submit"
              disabled={isScanning || wakeup.phase === 'waking'}
            >
              Scan Repository
            </button>
          </form>

          {wakeup.phase === 'waking' && (
            <div className="wakeup-status" role="status" aria-live="polite">
              <p>Server is waking up, this can take up to a minute.</p>
              <progress
                max={90}
                value={90 - wakeup.secondsRemaining}
                aria-label={`${wakeup.secondsRemaining} seconds remaining`}
              />
              <span>Waiting up to {wakeup.secondsRemaining}s</span>
            </div>
          )}

          {isScanning && wakeup.phase !== 'waking' && (
            <div className="scan-status">
              <span className="scan-status-dot" />
              <span>Scanning repository...</span>
            </div>
          )}

          {wakeup.phase === 'error' && (
            <div className="wakeup-error" role="alert">
              <p>{wakeup.error}</p>
              <button type="button" onClick={() => void startScan()}>
                Retry
              </button>
            </div>
          )}

          {error && <p className="error">{error}</p>}
        </section>

        {result && (
          <section className="results">
            <header className="repository-header">
              <div>
                <p className="eyebrow">REPOSITORY</p>

                <h2>
                  {result.snapshot.repository.owner}/
                  {result.snapshot.repository.name}
                </h2>

                <p>
                  Default branch:{' '}
                  <strong>{result.snapshot.repository.defaultBranch}</strong>
                </p>
              </div>

              <a
                href={result.snapshot.repository.url}
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub →
              </a>
            </header>

            <div className="stats">
              <article>
                <span>Files</span>
                <strong>{result.statistics.totalFiles}</strong>
              </article>

              <article>
                <span>Directories</span>
                <strong>{result.statistics.totalDirectories}</strong>
              </article>

              <article>
                <span>Total size</span>
                <strong>{formatFileSize(result.statistics.totalSize)}</strong>
              </article>
            </div>

            <div className="content-grid">
              <section className="panel">
                <header className="panel-header">
                  <h3>File extensions</h3>
                </header>

                <div className="extensions">
                  {Object.entries(result.statistics.extensions)
                    .sort(([, a], [, b]) => b - a)
                    .map(([extension, count]) => (
                      <div className="extension" key={extension}>
                        <span>{extension}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                </div>
              </section>

              <section className="panel repository-files-panel">
                <header className="panel-header">
                  <div>
                    <h3>Repository files</h3>

                    <p className="muted">
                      {result.snapshot.files.length.toLocaleString()} files
                    </p>
                  </div>

                  {totalFilePages > 1 && (
                    <span className="file-page-indicator">
                      Page {filePage} of {totalFilePages}
                    </span>
                  )}
                </header>

                <div className="file-list">
                  {paginatedFiles.map((file) => (
                    <button
                      type="button"
                      className="file"
                      key={file.path}
                      onClick={() => void handleFileSelect(file.path)}
                    >
                      <span>{file.path}</span>

                      {file.size !== undefined && (
                        <small>{formatFileSize(file.size)}</small>
                      )}
                    </button>
                  ))}
                </div>

                {totalFilePages > 1 && (
                  <nav
                    className="file-pagination"
                    aria-label="Repository files pagination"
                  >
                    <button
                      type="button"
                      disabled={filePage === 1}
                      onClick={() => setFilePage(1)}
                    >
                      First
                    </button>

                    <button
                      type="button"
                      disabled={filePage === 1}
                      onClick={() => setFilePage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>

                    <span>
                      {filePage} / {totalFilePages}
                    </span>

                    <button
                      type="button"
                      disabled={filePage === totalFilePages}
                      onClick={() =>
                        setFilePage((p) => Math.min(totalFilePages, p + 1))
                      }
                    >
                      Next
                    </button>

                    <button
                      type="button"
                      disabled={filePage === totalFilePages}
                      onClick={() => setFilePage(totalFilePages)}
                    >
                      Last
                    </button>
                  </nav>
                )}
              </section>

              <section className="panel">
                <header className="panel-header">
                  <h3>Repository structure</h3>

                  {result.tree.length > 0 && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => void handleCopyTree()}
                      title="Copy structure to clipboard"
                    >
                      {isCopied ? (
                        <Check size={16} className="success-icon" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  )}
                </header>

                {result.tree.length > 0 ? (
                  <RepositoryTree
                    nodes={result.tree}
                    onFileSelect={(node) => {
                      if (node.type === 'file') {
                        void handleFileSelect(node.path);
                      }
                    }}
                  />
                ) : (
                  <p className="muted">Repository is empty.</p>
                )}
              </section>

              {isLoadingFile && (
                <section className="panel file-viewer-loading">
                  Loading file...
                </section>
              )}

              {selectedFile && !isLoadingFile && (
                <FileViewer
                  file={selectedFile}
                  repositoryUrl={result.snapshot.repository.url}
                  branch={result.snapshot.repository.defaultBranch}
                  onClose={() => setSelectedFile(null)}
                />
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-content">
          <p className="footer-crafted">
            Crafted with <span className="footer-heart">♥</span> by
          </p>

          <div className="footer-developer">
            <a
              href="https://github.com/rohitbytecode"
              target="_blank"
              rel="noreferrer"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              <span>Rohit More</span>
            </a>
          </div>

          <p className="footer-tech">
            Built with <span>React</span> + <span>TypeScript</span> +{' '}
            <span>Vite</span>
          </p>
        </div>
      </footer>
    </>
  );
}

export default App;
