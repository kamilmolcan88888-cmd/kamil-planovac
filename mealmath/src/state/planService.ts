import type { ChangePreview } from '../engine/changes';
import type { PlanResult } from '../engine/planner';
import type { ChangeRequest, PlanJob } from '../workers/requestBase';

let worker: Worker | undefined;
let seq = 0;
const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();

function call<T>(msg: Record<string, unknown>): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('../workers/planner.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result); else p.reject(new Error(e.data.error));
    };
  }
  return new Promise<T>((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
    worker!.postMessage({ id, ...msg });
  });
}

/** Runs the deterministic planner off the main thread. */
export const planInWorker = (job: PlanJob) => call<PlanResult>({ type: 'plan', job });

/** Computes a change preview off the main thread. Nothing is saved. */
export const previewInWorker = <T = ChangePreview>(req: ChangeRequest) => call<T>({ type: 'change', req });
