import type { Config } from '../engine.ts';
import type { LanguageStrings } from '../i18n.ts';
import type { RolloutRequest } from './protocol.ts';

export interface RolloutTransfer {
  readonly config: Config;
  readonly language: LanguageStrings;
  readonly moveTo: boolean;
  readonly payload: string;
  readonly request: RolloutRequest;
  readonly visible: boolean;
}
