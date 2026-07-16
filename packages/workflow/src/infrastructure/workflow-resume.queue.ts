import { Queue, Worker, type Job } from 'bullmq';
import type { WorkflowGraph } from '../domain/workflow-graph';
import type { WorkflowExecutionEngine } from '../application/workflow-execution.engine';

const QUEUE_NAME = 'workflow-resume';

function connectionOptions() {
  const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
  return { host: url.hostname, port: Number(url.port || 6379) };
}

/**
 * DELAY node scheduling backed by a real BullMQ delayed job — not setTimeout. If
 * Redis/BullMQ is unavailable, enqueue fails loudly (docs/DOMAIN_MODEL_PHASE2.md §9).
 */
export class WorkflowResumeQueue {
  private readonly queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAME, { connection: connectionOptions() });
  }

  async enqueue(executionId: string, resumeAt: Date): Promise<void> {
    const delayMs = Math.max(0, resumeAt.getTime() - Date.now());
    await this.queue.add(
      'resume',
      { executionId },
      { delay: delayMs, jobId: `resume-${executionId}` },
    );
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

/**
 * Worker process that resumes a waiting WorkflowExecution once its delay elapses. Callers
 * (apps/backend worker entrypoint) construct this once with a graph-loader function that
 * fetches the correct WorkflowGraph for the execution's workflow/version.
 */
export function createWorkflowResumeWorker(
  engine: WorkflowExecutionEngine,
  loadGraphForExecution: (executionId: string) => Promise<WorkflowGraph>,
): Worker {
  return new Worker(
    QUEUE_NAME,
    async (job: Job<{ executionId: string }>) => {
      const graph = await loadGraphForExecution(job.data.executionId);
      await engine.resume(graph, job.data.executionId);
    },
    { connection: connectionOptions() },
  );
}
