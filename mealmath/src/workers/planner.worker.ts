/// <reference lib="webworker" />
import { runPlanJob, type PlanJob } from './planRequest';

self.onmessage = (e: MessageEvent<{ id: number; job: PlanJob }>) => {
  try {
    const result = runPlanJob(e.data.job);
    self.postMessage({ id: e.data.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: e.data.id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
