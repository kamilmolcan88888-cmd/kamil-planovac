import type { PlanResult } from '../engine/planner';
import type { PlanJob } from '../workers/planRequest';

let worker: Worker | undefined;
let seq = 0;
const pending = new Map<number, { resolve: (r: PlanResult) => void; reject: (e: Error) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/planner.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: PlanResult; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result!); else p.reject(new Error(e.data.error));
    };
  }
  return worker;
}

/** Runs the deterministic planner off the main thread. */
export function planInWorker(job: PlanJob): Promise<PlanResult> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, job });
  });
}
