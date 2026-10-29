/// <reference lib="webworker" />
import { runChange, runPlanJob, type ChangeRequest, type PlanJob } from './planRequest';

type Msg = { id: number; type: 'plan'; job: PlanJob } | { id: number; type: 'change'; req: ChangeRequest };

self.onmessage = (e: MessageEvent<Msg>) => {
  try {
    const result = e.data.type === 'plan' ? runPlanJob(e.data.job) : runChange(e.data.req);
    self.postMessage({ id: e.data.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: e.data.id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
