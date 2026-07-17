import { noop } from './shared/noop.ts';
import { ensureNonNullable } from './type-guards.ts';

export const KEY_ARROW_LEFT = 37;
export const KEY_ARROW_UP = 38;
export const KEY_ARROW_RIGHT = 39;
export const KEY_ARROW_DOWN = 40;
export const KEY_A = 65;
export const KEY_C = 67;
export const KEY_D = 68;
export const KEY_S = 83;
export const KEY_W = 87;
export const MOUSE_BUTTON_RIGHT = 2;
export const MOUSE_BUTTONS_RIGHT_FLAG = 2;
export const MOUSE_BUTTONS_MIDDLE_FLAG = 4;
export function preventEventDefault(event: Event): void {
  event.preventDefault();
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class KeyboardModeSwitch {
  public mode2: boolean;
  public constructor() {
    this.mode2 = false;
  }

  public get(): boolean {
    return this.mode2;
  }

  public switch(): void {
    noop();
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface PointerState {
  x: number;
  y: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface MouseButtonsState {
  left: boolean;
  middle: boolean;
  right: boolean;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface ModifiersState {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface KeyCodeHandler {
  code: number;
  handler: () => void;
}
export interface KeyCodeSetHandler {
  codes: number[];
  handler: () => void;
}

export class Controller {
  public buttons: MouseButtonsState;
  public codes: KeyCodeHandler[];
  public dispose: () => void;
  public down: boolean;
  public keyboardModeSwitch: KeyboardModeSwitch | undefined;
  public lastMouse: null | PointerState;
  public left: boolean;
  public modifiers: ModifiersState;
  public mouse: null | PointerState;
  public pressedButtons: number[];
  public right: boolean;
  public sets: KeyCodeSetHandler[];
  public up: boolean;
  public constructor(element: HTMLElement, keyboardModeSwitch?: KeyboardModeSwitch) {
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
    this.modifiers = {
      alt: false,
      ctrl: false,
      meta: false,
      shift: false
    };
    this.mouse = null;
    this.lastMouse = null;
    this.buttons = {
      left: false,
      middle: false,
      right: false
    };
    this.codes = [];
    this.sets = [];
    this.keyboardModeSwitch = keyboardModeSwitch;
    this.pressedButtons = [];
    const onKeyDown = (event: KeyboardEvent): void => {
      this.onKeyChange(event, true);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      this.onKeyChange(event, false);
    };
    if (keyboardModeSwitch) {
      keyboardModeSwitch.get();
      window.addEventListener('keydown', onKeyDown, false);
      window.addEventListener('keyup', onKeyUp, false);
    }
    element.addEventListener('contextmenu', preventEventDefault, false);
    const onMouseDown = (event: MouseEvent): void => {
      this.onMouseChange(event, true);
    };
    const onMouseUp = (event: MouseEvent): void => {
      this.onMouseChange(event, false);
    };
    const onMouseLeave = (event: MouseEvent): void => {
      this.lastMouse = this.mouse;
      this.mouse = null;
      event.preventDefault();
    };
    const onMouseMove = (event: MouseEvent): void => {
      this.mouse = {
        x: event.pageX,
        y: event.pageY
      };
      event.preventDefault();
    };
    const onMouseEnter = (event: MouseEvent): void => {
      onMouseMove(event);
      const {
        buttons
      } = event;
      this.buttons = {
        // eslint-disable-next-line no-bitwise -- MouseEvent.buttons is a bitmask (bit 0 = left).
        left: !!(buttons & 1),
        // eslint-disable-next-line no-bitwise -- MouseEvent.buttons bitmask (middle button bit).
        middle: !!(buttons & MOUSE_BUTTONS_MIDDLE_FLAG),
        // eslint-disable-next-line no-bitwise -- MouseEvent.buttons bitmask (right button bit).
        right: !!(buttons & MOUSE_BUTTONS_RIGHT_FLAG)
      };
      event.preventDefault();
    };
    element.addEventListener('mouseenter', onMouseEnter, false);
    element.addEventListener('mousemove', onMouseMove, false);
    element.addEventListener('mouseleave', onMouseLeave, false);
    element.addEventListener('mousedown', onMouseDown, false);
    element.addEventListener('mouseup', onMouseUp, false);
    const onTouchEnd = (event: TouchEvent): void => {
      this.lastMouse = this.mouse;
      this.mouse = null;
      event.preventDefault();
    };
    const onTouchMove = (event: TouchEvent): void => {
      const event2 = ensureNonNullable(event.changedTouches[0]);
      this.mouse = {
        x: event2.clientX,
        y: event2.clientY
      };
      event.preventDefault();
    };
    element.addEventListener('touchstart', onTouchMove, false);
    element.addEventListener('touchmove', onTouchMove, false);
    element.addEventListener('touchend', onTouchEnd, false);
    element.addEventListener('touchcancel', onTouchEnd, false);
    this.dispose = (): void => {
      element.removeEventListener('contextmenu', preventEventDefault, false);
      if (keyboardModeSwitch) {
        window.removeEventListener('keydown', onKeyDown, false);
        window.removeEventListener('keyup', onKeyUp, false);
      }
      element.removeEventListener('mouseenter', onMouseEnter, false);
      element.removeEventListener('mousemove', onMouseMove, false);
      element.removeEventListener('mouseleave', onMouseLeave, false);
      element.removeEventListener('mousedown', onMouseDown, false);
      element.removeEventListener('mouseup', onMouseUp, false);
    };
  }

  public addButton(code: number, handler: () => void): void {
    this.codes.push({
      code,
      handler
    });
  }

  public addSet(codes: number[], handler: () => void): void {
    this.sets.push({
      codes: codes.sort(),
      handler
    });
  }

  public onKeyChange(event: KeyboardEvent, isPressed: boolean): void {
    if (event.target === document.body) {
      let isHandled = true;
      const {
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- the engine's key handling is keyed by keyCode (documented input contract).
        keyCode
      } = event;
      const pressedIndex = this.pressedButtons.indexOf(keyCode);
      if (isPressed) {
        if (pressedIndex < 0) {
          this.pressedButtons.push(keyCode);
        }
        const matchedSet = this.sets.find((set: KeyCodeSetHandler) => set.codes.every((code: number) => !!this.pressedButtons.find((pressedCode: number) => pressedCode === code)));
        if (matchedSet) {
          matchedSet.handler();
        }
      } else {
        if (pressedIndex >= 0) {
          this.pressedButtons.splice(pressedIndex, 1);
        }
        const matchedCode = this.codes.find((codeHandler: KeyCodeHandler) => codeHandler.code === keyCode);
        if (matchedCode) {
          matchedCode.handler();
        }
      }
      switch (keyCode) {
        case KEY_A:
        case KEY_ARROW_LEFT:
          this.left = isPressed;
          break;
        case KEY_ARROW_DOWN:
        case KEY_S:
          this.down = isPressed;
          break;
        case KEY_ARROW_RIGHT:
        case KEY_D:
          this.right = isPressed;
          break;
        case KEY_ARROW_UP:
        case KEY_W:
          this.up = isPressed;
          break;
        case KEY_C:
          if (!isPressed && this.keyboardModeSwitch) {
            this.keyboardModeSwitch.switch();
          }
          break;
        default:
          isHandled = false;
          break;
      }
      this.modifiers.shift = event.shiftKey;
      this.modifiers.ctrl = event.ctrlKey;
      this.modifiers.alt = event.altKey;
      this.modifiers.meta = event.metaKey;
      if (isHandled) {
        event.preventDefault();
      }
    }
  }

  public onMouseChange(event: MouseEvent, isPressed: boolean): void {
    switch (event.button) {
      case 0:
        this.buttons.left = isPressed;
        break;
      case 1:
        this.buttons.middle = isPressed;
        break;
      case MOUSE_BUTTON_RIGHT:
        this.buttons.right = isPressed;
        break;
      default:
        break;
    }
  }

  public pressed(): boolean {
    return this.up || this.down || this.left || this.right;
  }
}
