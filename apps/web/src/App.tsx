import { useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import type { RepositoryTreeNode } from '@vaultmap/types';
import RepositoryTree from './components/RepositoryTree';

import './App.css';

function generateTreeText(nodes: RepositoryTreeNode[], prefix = ''): string {
  let text = '';
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';

    text += `${prefix}${connector}${node.name}${node.type === 'directory' ? '/' : ''}\n`;

    if (
      node.type === 'directory' &&
      node.children &&
      node.children.length > 0
    ) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      text += generateTreeText(node.children, childPrefix);
    }
  });
  return text;
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

const API_URL = 'http://localhost:6770';
const FILES_PER_PAGE = 100;

function App() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [filePage, setFilePage] = useState(1);

  const handleCopyTree = () => {
    if (!result?.tree) return;
    const text = generateTreeText(result.tree);
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const totalFilePages = result
    ? Math.ceil(result.snapshot.files.length / FILES_PER_PAGE)
    : 0;

  const paginatedFiles = useMemo(() => {
    if (!result) {
      return [];
    }

    const start = (filePage - 1) * FILES_PER_PAGE;

    return result.snapshot.files.slice(start, start + FILES_PER_PAGE);
  }, [result, filePage]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setResult(null);
    setIsScanning(true);
    setIsScanning(true);

    try {
      const response = await fetch(`${API_URL}/api/repositories/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to scan repository');
      }

      setResult(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to scan repository',
      );
    } finally {
      setIsScanning(false);
    }
  }

  return (
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

          <button type="submit" disabled={isScanning}>
            {isScanning ? 'Scanning...' : 'Scan Repository'}
          </button>
        </form>

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
              <strong>
                {(result.statistics.totalSize / 1024 / 1024).toFixed(2)} MB
              </strong>
            </article>
          </div>

          <div className="content-grid">
            <section className="panel">
              <h3>File extensions</h3>

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
                  <div className="file" key={file.path}>
                    <span>{file.path}</span>

                    {file.size !== undefined && (
                      <small>{(file.size / 1024).toFixed(1)} KB</small>
                    )}
                  </div>
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
                    onClick={() => setFilePage((page) => Math.max(1, page - 1))}
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
                      setFilePage((page) => Math.min(totalFilePages, page + 1))
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
                    className="icon-button"
                    onClick={handleCopyTree}
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
                <RepositoryTree nodes={result.tree} />
              ) : (
                <p className="muted">Repository is empty.</p>
              )}
            </section>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
