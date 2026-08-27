import { useState } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import type { RepositoryFileContent } from '@vaultmap/types';

interface FileViewerProps {
  file: RepositoryFileContent;
  repositoryUrl: string;
  branch: string;
  onClose: () => void;
}

function FileViewer({ file, repositoryUrl, branch, onClose }: FileViewerProps) {
  const [copied, setCopied] = useState(false);

  const githubFileUrl = `${repositoryUrl}/blob/${branch}/${file.path}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable or permission denied — fail silently.
      // Consider a toast notification if this becomes a reported issue.
    }
  }

  return (
    <section className="file-viewer panel">
      <header className="file-viewer-header">
        <div className="file-viewer-title">
          <strong>{file.name}</strong>
          <span>{file.path}</span>
        </div>

        <div className="file-viewer-actions">
          <button
            type="button"
            className="icon-button"
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy file contents'}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>

          <a
            className="icon-button"
            href={githubFileUrl}
            target="_blank"
            rel="noreferrer"
            title="Open on GitHub"
          >
            <ExternalLink size={16} />
          </a>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            title="Close file"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="file-viewer-content">
        <pre>
          <code>{file.content}</code>
        </pre>
      </div>
    </section>
  );
}

export default FileViewer;
