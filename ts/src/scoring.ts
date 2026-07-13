import Cookies from 'js-cookie';

import type { Game } from './engine.ts';
import type {
  ComebackInfo,
  SchemeConstructor,
  Unit
} from './entities.ts';

import {
  FIXED_DECIMAL_DIGITS,
  MILLISECONDS_IN_SECOND,
  PERCENT_MAX
} from './shared/constants.ts';
import {
  easeOutCubic,
  formatFixed2
} from './shared/math-utils.ts';
import { noop } from './shared/noop.ts';
import { ensureNonNullable } from './type-guards.ts';

type StoredChallenges = Record<string, boolean>;

// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface AchievementChecker {
  check(unit: Unit, dt: number, game: Game): boolean;
  onKill(unit: Unit): void;
  onOut(): void;
  progress: number;
  update(unit: Unit, dt: number, game: Game): void;
}
export interface AchievementConfig {
  description: string;
  getChecker: () => AchievementChecker;
  modes: string[];
  name: string;
  onEarned?: (game: Game, achievement: Achievement) => void;
  url: string;
}
export interface StoredAchievement {
  best: number;
  earned: boolean;
  name: string;
}
export interface StoredProfile {
  achievements?: StoredAchievement[];
}
export class SchemeCycler {
  public current: number;
  public Schemes: SchemeConstructor[];
  public constructor(...schemeConstructors: SchemeConstructor[]) {
    this.Schemes = schemeConstructors;
    this.current = 0;
  }

  public getSchemes(unit: Unit): Scoreboard {
    return new Scoreboard(this.Schemes.map((SchemeClass: SchemeConstructor) => new SchemeClass(unit)), this);
  }

  public next(): void {
    this.current++;
    if (this.current === this.Schemes.length) {
      this.current = 0;
    }
  }
}
export class Scoreboard {
  public manager: SchemeCycler;
  public schemes: ScoreLabel[];
  public constructor(schemes: ScoreLabel[], manager: SchemeCycler) {
    this.schemes = schemes;
    this.manager = manager;
  }

  public comeback(info?: ComebackInfo): void {
    this.schemes.forEach((scheme: ScoreLabel, index: number) => {
      scheme.comeback(info, this.manager.current !== index);
    });
  }

  public getScheme(name?: string): ScoreLabel {
    if (name) {
      return ensureNonNullable(this.schemes.find((scheme: ScoreLabel) => scheme.name === name));
    }
    return ensureNonNullable(this.schemes[this.manager.current]);
  }

  public kill(killer?: Unit, cause?: number): void {
    this.schemes.forEach((scheme: ScoreLabel, index: number) => {
      scheme.kill(killer, cause, this.manager.current !== index);
    });
  }

  public out(): void {
    this.schemes.forEach((scheme: ScoreLabel, index: number) => {
      scheme.out(this.manager.current !== index);
    });
  }

  public print(score?: number): string {
    return ensureNonNullable(this.schemes[this.manager.current]).print(score);
  }

  public result(): number {
    return ensureNonNullable(this.schemes[this.manager.current]).result();
  }

  public scores(): number {
    return ensureNonNullable(this.schemes[this.manager.current]).scores();
  }

  public update(dt?: number): void {
    this.schemes.forEach((scheme: ScoreLabel, index: number) => {
      scheme.update(dt, this.manager.current !== index);
    });
  }
}
export const MIN_LABEL_INCREMENT_PERCENT = 0.01;
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class ScoreLabel {
  public accumulator = 0;
  public name: string;
  public unit: Unit;
  public constructor(unit: Unit, name: string) {
    this.unit = unit;
    this.name = name;
  }

  public comeback(_info?: ComebackInfo, _isNotCurrent?: boolean): void {
    noop();
  }

  public getScheme(): this {
    return this;
  }

  public kill(_killer?: Unit, _cause?: number, _isNotCurrent?: boolean): void {
    noop();
  }

  public out(_isNotCurrent?: boolean): void {
    noop();
  }

  public print(_score?: number): string {
    return formatFixed2(this.scores());
  }

  public result(): number {
    return this.scores();
  }

  public scores(): number {
    return 0;
  }

  public update(_dt?: number, _isNotCurrent?: boolean): void {
    noop();
  }
}

export class BotScoreLabel extends ScoreLabel {
  public constructor(unit: Unit) {
    super(unit, 'percent');
  }

  public override comeback({
    increment
  }: ComebackInfo, isNotCurrent?: boolean): void {
    if (!isNotCurrent && increment * PERCENT_MAX >= MIN_LABEL_INCREMENT_PERCENT && this.unit.isPlayer) {
      this.unit.addLabel({
        color: this.unit.skin.colors.nick,
        fading: true,
        text: `+${(increment * PERCENT_MAX).toFixed(FIXED_DECIMAL_DIGITS)}%`,
        time: MILLISECONDS_IN_SECOND,
        unit: this.unit
      });
    }
  }

  public override kill(killer?: Unit, _cause?: number, isNotCurrent?: boolean): void {
    if (!isNotCurrent && this.unit.isPlayer) {
      this.unit.addLabel({
        color: ensureNonNullable(killer).skin.colors.main,
        fading: true,
        text: this.unit.game.language.killText,
        time: MILLISECONDS_IN_SECOND,
        unit: this.unit
      });
    }
  }

  public override print(scoreOverride?: number): string {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- a 0 override should fall through to the live score, matching the original.
    const score = scoreOverride || this.scores();
    return `${formatFixed2(score)}%`;
  }

  public override result(): number {
    return Number(this.scores().toFixed(FIXED_DECIMAL_DIGITS));
  }

  public override scores(): number {
    return this.unit.percent * PERCENT_MAX;
  }
}
export const QUEST_FADE_MS = 500;
export const QUEST_HOLD_MS = 3000;
export const QUEST_LINGER_MS = 250;
export const QUEST_STATE_FADE_OUT = 2;
export class Quest {
  public current: number;
  public description: string;
  public image: HTMLImageElement | null;
  public ready: boolean;
  public state: number;
  public states: number[];
  public title: string;
  public constructor(title: string, description: string, imageUrl?: string) {
    this.title = title;
    this.description = description;
    this.state = 0;
    this.current = 0;
    this.states = [QUEST_FADE_MS, QUEST_HOLD_MS, QUEST_FADE_MS, QUEST_LINGER_MS];
    this.image = null;
    if (imageUrl) {
      this.ready = false;
      const image = new Image();
      image.onload = (): void => {
        this.ready = true;
        this.image = image;
      };
      image.onerror = (): void => {
        this.ready = true;
      };
      image.src = imageUrl;
    } else {
      this.ready = true;
    }
  }

  public position(): number {
    switch (this.state) {
      case 0:
        return easeOutCubic(this.current / ensureNonNullable(this.states[0]));
      case 1:
        return 1;
      case QUEST_STATE_FADE_OUT:
        return 1 - easeOutCubic(this.current / ensureNonNullable(this.states[QUEST_STATE_FADE_OUT]));
      default:
        return 0;
    }
  }

  public update(amount: number): void {
    this.current += amount;
    if (this.current > ensureNonNullable(this.states[this.state])) {
      this.state++;
      this.current = 0;
    }
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class Achievement {
  public best: number;
  public checker: AchievementChecker | null;
  public description: string;
  public earned: boolean;
  public getChecker: () => AchievementChecker;
  public modes: string[];
  public name: string;
  public onEarned?: (game: Game, achievement: Achievement) => void;
  public url: string;
  public constructor(name: string, modes: string[], getChecker: () => AchievementChecker, description: string, url: string, onEarned?: (game: Game, achievement: Achievement) => void) {
    this.name = name;
    this.modes = modes;
    this.getChecker = getChecker;
    this.description = description;
    this.url = url;
    if (onEarned) {
      this.onEarned = onEarned;
    }
    this.best = 0;
    this.earned = false;
    this.checker = null;
  }

  public success(game: Game): void {
    this.earned = true;
    if (window.ga) {
      window.ga('send', 'event', 'skins_unlock', this.name);
    }
    this.checker = null;
    if (this.onEarned) {
      this.onEarned(game, this);
    }
    game.notifications.push(new Quest('New skin unlocked!', this.description, this.url));
  }
}
export const DAYS_IN_YEAR = 365;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller chooses the shape it expects from the untyped cookie JSON.
export function readCookieJson<T>(name: string): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- js-cookie's deprecated getJSON is typed `any`.
  return Cookies.getJSON(name);
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class AchievementStore {
  public achievements: Achievement[];
  public storageName: string;
  public constructor(achievementConfigs: AchievementConfig[], storageName = 'paper.io.storage') {
    this.storageName = storageName;
    this.achievements = achievementConfigs.map((achievement: AchievementConfig) => new Achievement(achievement.name, achievement.modes, achievement.getChecker, achievement.description, achievement.url, achievement.onEarned));
  }

  public load(): void {
    const challenges: StoredChallenges = readCookieJson<StoredChallenges>('paperio_challenges') ?? {};
    const loadChallenge = (challengeKey: string, achievementName: string): void => {
      if (challenges[challengeKey]) {
        const achievement = this.achievements.find((candidate: Achievement) => candidate.name === achievementName);
        if (achievement) {
          achievement.earned = true;
        }
      }
    };
    loadChallenge('c13', 'reaper');
    loadChallenge('c22', 'capAmerica');
    loadChallenge('c22', 'thanos');
    loadChallenge('geraldquest1', 'geralt');
    const profile: StoredProfile = readCookieJson<StoredProfile>(this.storageName) ?? {};
    if (profile.achievements) {
      profile.achievements.forEach((achievement: StoredAchievement) => {
        const achievement2 = this.achievements.find((candidate: Achievement) => candidate.name === achievement.name);
        if (achievement2) {
          achievement2.best = achievement.best || 0;
          achievement2.earned = achievement.earned || false;
        }
      });
    }
  }

  public save(): void {
    const storedAchievements: StoredAchievement[] = this.achievements.map((achievement: Achievement) => ({
      best: achievement.best,
      earned: achievement.earned,
      name: achievement.name
    }));
    const profile: StoredProfile = readCookieJson<StoredProfile>(this.storageName) ?? {};
    profile.achievements = storedAchievements;
    const cookieOptions = {
      expires: DAYS_IN_YEAR
    };
    Cookies.set(this.storageName, profile, cookieOptions);
    const challenges: StoredChallenges = readCookieJson<StoredChallenges>('paperio_challenges') ?? {};
    const saveChallenge = (challengeKey: string, achievementName: string): void => {
      const achievement = this.achievements.find((candidate: Achievement) => candidate.name === achievementName);
      if (achievement?.earned) {
        challenges[challengeKey] = true;
      }
    };
    saveChallenge('c13', 'reaper');
    saveChallenge('c22', 'capAmerica');
    saveChallenge('c22', 'thanos');
    saveChallenge('geraldquest1', 'geralt');
    saveChallenge('sanitizerquest', 'sanitizer');
    saveChallenge('doctorquest', 'doctor');
    saveChallenge('covidquest', 'covid');
    Cookies.set('paperio_challenges', challenges, cookieOptions);
    // eslint-disable-next-line camelcase -- `paperio_challenges` is the external shop integration's global.
    window.paperio_challenges = challenges;
    if (window.shop) {
      window.shop.autoCheckUnlock();
    } else {
      console.warn('window.shop unavaliable');
    }
  }
}
export class AchievementTracker {
  public achievements: Achievement[] = [];
  public profile: AchievementStore | null;
  public constructor(profile: AchievementStore | null, mode: string) {
    this.profile = profile;
    if (!this.profile) {
      return;
    }
    this.achievements = ensureNonNullable(profile).achievements.filter((achievement: Achievement) => {
      const shouldTrack = !achievement.earned && achievement.modes.some((candidateMode: string) => candidateMode === mode);
      if (shouldTrack) {
        achievement.checker = achievement.getChecker();
      }
      return shouldTrack;
    });
  }

  public finish(): void {
    this.achievements = [];
    ensureNonNullable(this.profile).save();
  }

  public onKill(unit: Unit): void {
    this.achievements.forEach((achievement: Achievement) => {
      ensureNonNullable(achievement.checker).onKill(unit);
    });
  }

  public onOut(): void {
    this.achievements.forEach((achievement: Achievement) => {
      ensureNonNullable(achievement.checker).onOut();
    });
  }

  public update(unit: Unit, value: number, game: Game): void {
    this.achievements = this.achievements.filter((achievement: Achievement) => {
      ensureNonNullable(achievement.checker).update(unit, value, game);
      if (ensureNonNullable(achievement.checker).progress > achievement.best) {
        achievement.best = ensureNonNullable(achievement.checker).progress;
      }
      if (ensureNonNullable(achievement.checker).check(unit, value, game)) {
        achievement.success(game);
        ensureNonNullable(this.profile).save();
        return false;
      }
      return true;
    });
  }
}
