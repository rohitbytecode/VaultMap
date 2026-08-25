import { useState } from 'react';

import './App.css';

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
}

const API_URL = 'http://localhost:3000';

function App() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setResult(null);
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

            <section className="panel">
              <h3>Repository files</h3>

              <div className="file-list">
                {result.snapshot.files.slice(0, 100).map((file) => (
                  <div className="file" key={file.path}>
                    <span>{file.path}</span>

                    {file.size !== undefined && (
                      <small>{(file.size / 1024).toFixed(1)} KB</small>
                    )}
                  </div>
                ))}
              </div>

              {result.snapshot.files.length > 100 && (
                <p className="muted">
                  Showing first 100 of {result.snapshot.files.length} files.
                </p>
              )}
            </section>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
