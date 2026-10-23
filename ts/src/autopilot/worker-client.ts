/**
 * @file
 *
 * The page's side of the autopilot's worker (`worker.ts`): it starts the worker from the source the build inlined, and
 * pairs each loop plan with the request it answers.
 */

import type {
  PlanInput,
  PlannedLoop
} from './whitebox.ts';
import type {
  AutopilotWorkerReply,
  AutopilotWorkerRequest,
  DirectionReply
} from './worker-protocol.ts';

export class AutopilotWorker {
  /** Told of every blackbox decision. */
  public onDirection: ((reply: DirectionReply) => void) | null = null;
  private planRequests = 0;
  private readonly plans = new Map<number, (plan: null | PlannedLoop) => void>();

  /**
   * Wraps a started worker.
   *
   * @param worker - The worker.
   * @param url - The blob URL it was started from, revoked when it is terminated.
   */
  public constructor(private readonly worker: Worker, private readonly url: string) {
    worker.addEventListener('message', (event: MessageEvent<AutopilotWorkerReply>) => {
      const reply = event.data;
      if (reply.kind === 'direction') {
        this.onDirection?.(reply);
        return;
      }
      const answer = this.plans.get(reply.id);
      this.plans.delete(reply.id);
      answer?.(reply.plan);
    });
  }

  /**
   * Plans a loop in the worker.
   *
   * @param input - What the plan reads.
   * @param answer - Called with the plan once the worker has it.
   */
  public plan(input: PlanInput, answer: (plan: null | PlannedLoop) => void): void {
    const id = ++this.planRequests;
    this.plans.set(id, answer);
    this.send({ id, input, kind: 'plan' });
  }

  /** Makes the worker's blackbox pilot forget its loop and its bearings. */
  public reset(): void {
    this.send({ kind: 'reset' });
  }

  /**
   * Hands a frame to the worker's blackbox pilot; the frame is the worker's from then on.
   *
   * @param frame - The canvas, scaled down.
   * @param epoch - The page's reset count.
   * @param debug - Whether to send the pilot's view back.
   */
  public sendFrame(frame: ImageBitmap, epoch: number, debug: boolean): void {
    this.worker.postMessage({ debug, epoch, frame, kind: 'frame' } satisfies AutopilotWorkerRequest, [frame]);
  }

  public terminate(): void {
    this.worker.terminate();
    URL.revokeObjectURL(this.url);
    this.plans.clear();
  }

  private send(request: AutopilotWorkerRequest): void {
    this.worker.postMessage(request);
  }
}

/**
 * Starts the autopilot's worker, when this page can run it.
 *
 * @returns The worker, or `null` without workers, `OffscreenCanvas` or `createImageBitmap`, or in a bundle built
 *   without the worker's source (the unit tests).
 */
export function startAutopilotWorker(): AutopilotWorker | null {
  if (typeof AUTOPILOT_WORKER_SOURCE !== 'string' || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return null;
  }
  try {
    const url = URL.createObjectURL(new Blob([AUTOPILOT_WORKER_SOURCE], { type: 'text/javascript' }));
    return new AutopilotWorker(new Worker(url), url);
  } catch {
    return null;
  }
}
