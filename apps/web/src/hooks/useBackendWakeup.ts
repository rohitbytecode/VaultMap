import { useEffect, useRef, useState } from 'react';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? 'http://localhost:6770'
    : 'https://vaultmap-api.onrender.com')
).replace(/\/+$/, '');
const QUICK_TIMEOUT_MS = 2500;
const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 90_000;

type WakeupState =
  | { phase: 'idle'; secondsRemaining: 0; error: '' }
  | { phase: 'waking'; secondsRemaining: number; error: '' }
  | { phase: 'error'; secondsRemaining: 0; error: string };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function probeHealth(
  parentSignal: AbortSignal,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const requestController = new AbortController();
    const timeout = setTimeout(() => requestController.abort(), timeoutMs);
    const abortRequest = () => requestController.abort();

    parentSignal.addEventListener('abort', abortRequest, { once: true });

    fetch(`${API_URL}/health`, { signal: requestController.signal })
      .then((response) => {
        if (response.ok) {
          resolve(true);
        } else if (response.status < 500) {
          reject(
            new Error(`Health check failed with status ${response.status}.`),
          );
        } else {
          resolve(false);
        }
      })
      .catch(() => {
        if (parentSignal.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        } else {
          resolve(false);
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        parentSignal.removeEventListener('abort', abortRequest);
      });
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abortWait = () => {
      clearTimeout(timeout);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abortWait);
      resolve();
    }, ms);

    signal.addEventListener('abort', abortWait, { once: true });
    if (signal.aborted) abortWait();
  });
}

export function useBackendWakeup() {
  const [state, setState] = useState<WakeupState>({
    phase: 'idle',
    secondsRemaining: 0,
    error: '',
  });
  const controllerRef = useRef<AbortController | null>(null);
  const deadlineRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (deadlineRef.current === 0) return;
      setState((current) =>
        current.phase === 'waking'
          ? {
              ...current,
              secondsRemaining: Math.max(
                0,
                Math.ceil((deadlineRef.current - Date.now()) / 1000),
              ),
            }
          : current,
      );
    }, 1000);

    return () => {
      clearInterval(interval);
      controllerRef.current?.abort();
    };
  }, []);

  async function ensureAwake(): Promise<boolean> {
    if (controllerRef.current) return false;

    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;
    setState({ phase: 'idle', secondsRemaining: 0, error: '' });

    try {
      if (await probeHealth(signal, QUICK_TIMEOUT_MS)) return true;

      const deadline = Date.now() + MAX_WAIT_MS;
      deadlineRef.current = deadline;
      setState({
        phase: 'waking',
        secondsRemaining: Math.ceil(MAX_WAIT_MS / 1000),
        error: '',
      });

      while (Date.now() < deadline) {
        const remainingMs = deadline - Date.now();
        setState({
          phase: 'waking',
          secondsRemaining: Math.ceil(remainingMs / 1000),
          error: '',
        });

        if (
          await probeHealth(signal, Math.min(QUICK_TIMEOUT_MS, remainingMs))
        ) {
          setState({ phase: 'idle', secondsRemaining: 0, error: '' });
          return true;
        }

        const nextWaitMs = Math.min(POLL_INTERVAL_MS, deadline - Date.now());
        if (nextWaitMs > 0) await wait(nextWaitMs, signal);
      }

      setState({
        phase: 'error',
        secondsRemaining: 0,
        error:
          'Could not confirm server readiness after 90 seconds. Check VITE_API_URL and the backend CORS_ORIGIN, then retry.',
      });
      return false;
    } catch (error) {
      if (isAbortError(error)) return false;

      setState({
        phase: 'error',
        secondsRemaining: 0,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to reach the server.',
      });
      return false;
    } finally {
      deadlineRef.current = 0;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  return { ...state, ensureAwake };
}
