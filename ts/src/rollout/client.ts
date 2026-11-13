import type { Game } from '../engine.ts';
import type {
  RolloutReply,
  RolloutRequest,
  RolloutResult
} from './protocol.ts';
import type { RolloutTransfer } from './transfer.ts';

import { encodeSave } from '../save-format.ts';
import { captureSnapshot } from '../snapshot.ts';
import {
  MAX_ROLLOUT_CHARACTERS,
  ROLLOUT_TIMEOUT_MS,
  validateRollout
} from './protocol.ts';
import { validateRolloutWorld } from './state.ts';

const active = new Set<Game>();

/**
 * Experimental, between-frame capture. Does not engage or modify the pilot. One realm per request, at most one in flight.
 *
 * @param game - The live game, read only.
 * @param request - Bounded directions and explicit random state.
 * @param signal - Cancels and disposes the isolated realm.
 * @returns The per-frame continuation, ending at the first player death.
 */
export async function rollout(game: Game, request: RolloutRequest, signal?: AbortSignal): Promise<RolloutResult> {
  validateRollout(request);
  validateRolloutWorld(game);
  if (active.size > 0 || signal?.aborted) {
    throw new Error('Rollout busy or aborted');
  }
  if (
    game.stopped || game.pendingGameOver || game.clock.pendingTimers > 0 || game.particles.length > 0
    || game.enemies || game.practice || game.replaying || game.recording || game.citiesManager || game.isTest
    || game.achievementsProfile.achievements.length > 0
  ) {
    throw new Error('Unsupported rollout starting state (timers, particles or extensions)');
  }
  active.add(game);
  try {
    // Copy every live value before the first await. encodeSave only reads the captured graph.
    const snapshot = captureSnapshot(game);
    const transfer: RolloutTransfer = {
      config: { ...game.config },
      language: structuredClone(game.language),
      moveTo: game.player?.moveTo === true,
      payload: '',
      request: structuredClone(request),
      visible: game.visible
    };
    const payload = await encodeSave(game, snapshot, { id: 'rollout', name: 'rollout', percent: 0, playtime: 0, savedAt: 0 });
    if (payload.length > MAX_ROLLOUT_CHARACTERS || signal?.aborted) {
      throw new Error('Rollout transfer too large or aborted');
    }
    return await inRealm({ ...transfer, payload }, signal);
  } finally {
    active.delete(game);
  }
}

function inRealm(transfer: RolloutTransfer, signal?: AbortSignal): Promise<RolloutResult> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.sandbox.add('allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    const channel = new MessageChannel();
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error('Rollout timed out'));
    }, ROLLOUT_TIMEOUT_MS);
    function finish(error?: Error, result?: RolloutResult): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      frame.onload = null;
      signal?.removeEventListener('abort', abort);
      channel.port1.close();
      channel.port2.close();
      frame.remove();
      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      } else {
        reject(new Error('Invalid rollout reply'));
      }
    }
    function abort(): void {
      finish(new Error('Rollout aborted'));
    }
    signal?.addEventListener('abort', abort, { once: true });
    channel.port1.onmessage = (event: MessageEvent<RolloutReply>): void => {
      finish(event.data.error ? new Error(event.data.error) : undefined, event.data.result);
    };
    frame.onload = (): void => {
      frame.contentWindow?.postMessage(transfer, '*', [channel.port2]);
    };
    const base = document.createElement('base');
    base.href = new URL('./', document.baseURI).href;
    frame.srcdoc = `${base.outerHTML}<script>${ROLLOUT_SOURCE.replaceAll('</script', '<\\/script')}</script>`;
    document.body.append(frame);
  });
}
