/**
 * @file
 *
 * The autopilot's worker: it reads frames for the blackbox pilot and plans loops for the whitebox pilot off the page's
 * main thread, so neither holds up a frame. The build bundles it on its own and puts it in the game's bundle as a string
 * (`AUTOPILOT_WORKER_SOURCE`), which starts it from a blob.
 */

import type {
  AutopilotWorkerReply,
  AutopilotWorkerRequest,
  FrameRequest
} from './worker-protocol.ts';

import { BlackboxPilot } from './blackbox.ts';
import { findLoop } from './whitebox.ts';

const pilot = new BlackboxPilot();
let canvas: null | OffscreenCanvas = null;
/** The newest frame not read yet; one that arrives before it is read replaces it. */
let latest: FrameRequest | null = null;
let readScheduled = false;

/** Decides on the newest frame, after any frames that came in while the last decision ran have replaced each other. */
function decideOnLatest(): void {
  readScheduled = false;
  const request = latest;
  latest = null;
  if (!request) {
    return;
  }
  const pixels = readFrame(request.frame);
  const direction = pixels ? pilot.decide(pixels) : null;
  reply({ debug: request.debug ? pilot.debug : null, direction, epoch: request.epoch, kind: 'direction' });
}

/**
 * Reads a frame's pixels; the page has scaled it down already.
 *
 * @param frame - The frame.
 * @returns The pixels, or `null` when there is no 2D context.
 */
function readFrame(frame: ImageBitmap): ImageData | null {
  const { height, width } = frame;
  if (canvas?.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(width, height);
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    frame.close();
    return null;
  }
  context.drawImage(frame, 0, 0);
  frame.close();
  return context.getImageData(0, 0, width, height);
}

function reply(message: AutopilotWorkerReply): void {
  globalThis.postMessage(message);
}

globalThis.addEventListener('message', (event: MessageEvent<AutopilotWorkerRequest>) => {
  const request = event.data;
  switch (request.kind) {
    case 'frame':
      latest?.frame.close();
      latest = request;
      // The read waits for the messages already queued, so a decision that ran long is followed by the newest frame
      // rather than by every frame that came in meanwhile.
      if (!readScheduled) {
        readScheduled = true;
        setTimeout(decideOnLatest, 0);
      }
      break;
    case 'plan':
      reply({ id: request.id, kind: 'plan', plan: findLoop(request.input) });
      break;
    case 'reset':
      latest?.frame.close();
      latest = null;
      pilot.reset();
      break;
    default:
      break;
  }
});
