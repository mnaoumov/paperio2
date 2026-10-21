// On-screen joystick for touch devices. The offline game (app2.js) steers the
// player from four boolean flags (up/down/left/right) that its input handler
// toggles on keydown/keyup — and only when `event.target === document.body`.
// So instead of reaching into the obfuscated engine, we synthesize the same
// arrow-key events on document.body and let the game react as if a keyboard
// were used. See CLAUDE.md for how this contract was determined.
//
// The engine's keyboard steering SUMS the held direction flags into a vector,
// so holding two adjacent arrows (e.g. up + right) yields a diagonal heading.
// We exploit that to give a full 8-way stick: the circle is split into eight
// 45° sectors, and each sector holds one arrow (cardinal) or two (diagonal).
//
// The joystick is DYNAMIC/FLOATING: it has no fixed corner (the game's minimap
// already sits bottom-right). Instead it materializes centered on wherever the
// player first touches, so it lands under the thumb for either hand, and hides
// on release. Touches on menu/HUD controls are ignored.
//
// The player can show or hide it on demand: a small toggle button in the
// bottom-left corner, or the J key. The choice is remembered in localStorage.
// With no stored choice it is shown on touch / mobile-sized sessions and hidden
// on desktop, where a mouse drag can then summon it just like a touch.

(function () {
    'use strict';

    const KEY_CODE_LEFT = 37;
    const KEY_CODE_UP = 38;
    const KEY_CODE_RIGHT = 39;
    const KEY_CODE_DOWN = 40;

    const FULL_CIRCLE_RADIANS = Math.PI * 2;
    const SECTOR_COUNT = 8;
    const SECTOR_ANGLE_RADIANS = FULL_CIRCLE_RADIANS / SECTOR_COUNT;

    // Keys held for each 45° sector, indexed by sector number counted
    // counter-clockwise from east (right). Diagonal sectors hold two arrows,
    // which the engine sums into a diagonal heading.
    const SECTOR_KEYS = [
        [KEY_CODE_RIGHT], //              0: E  (right)
        [KEY_CODE_RIGHT, KEY_CODE_UP], // 1: NE (up-right)
        [KEY_CODE_UP], //                 2: N  (up)
        [KEY_CODE_LEFT, KEY_CODE_UP], //  3: NW (up-left)
        [KEY_CODE_LEFT], //               4: W  (left)
        [KEY_CODE_LEFT, KEY_CODE_DOWN], //5: SW (down-left)
        [KEY_CODE_DOWN], //               6: S  (down)
        [KEY_CODE_RIGHT, KEY_CODE_DOWN], //7: SE (down-right)
    ];

    // Fraction of the joystick radius the finger must travel from center before a
    // direction registers. Prevents jitter and accidental turns near the center.
    const DEADZONE_RATIO = 0.3;

    // Viewport width (px) at/below which we treat the session as mobile-sized and
    // show the joystick even without a detected touch/coarse pointer — so it also
    // appears in narrow desktop windows and DevTools responsive mode during testing.
    const MOBILE_MAX_WIDTH_PX = 820;

    // Selectors for menu / HUD controls that should not start the joystick.
    const NON_GAME_TARGET_SELECTOR = 'button, input, a, select, textarea, .uibox, #about, #lng';

    // Where the show/hide choice is remembered, and its two stored values.
    const STORAGE_KEY = 'paperio2.joystick';
    const STORED_SHOWN = 'shown';
    const STORED_HIDDEN = 'hidden';

    // The J key toggles the joystick. The engine does not use it (it reads
    // arrows/WASD, C, G and a Shift+Alt+Q+B+M debug combo).
    const TOGGLE_KEY_CODE = 'KeyJ';

    // Targets where a J keypress is typing, not a shortcut.
    const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable]';

    let baseElement = null;
    let knobElement = null;
    let toggleElement = null;
    let isEnabled = false;
    let activePointerId = null;
    const heldKeys = new Set();
    let centerX = 0;
    let centerY = 0;
    let radius = 0;

    init();

    function init() {
        createJoystick();
        createToggle();
        const stored = readStoredChoice();
        setEnabled(stored === null ? isTouchLikely() : stored === STORED_SHOWN);
        window.addEventListener('keydown', onToggleKeyDown);
    }

    function isTouchLikely() {
        return (
            window.matchMedia('(pointer: coarse)').matches ||
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0 ||
            window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches
        );
    }

    // localStorage can be missing or throw (private mode, blocked site data), so
    // every access is guarded: without it the default simply applies each visit.
    function readStoredChoice() {
        try {
            const value = window.localStorage.getItem(STORAGE_KEY);
            return value === STORED_SHOWN || value === STORED_HIDDEN ? value : null;
        } catch {
            return null;
        }
    }

    function writeStoredChoice(value) {
        try {
            window.localStorage.setItem(STORAGE_KEY, value);
        } catch {
            // Not persisted; the choice still holds for this visit.
        }
    }

    function setEnabled(enabled) {
        isEnabled = enabled;
        if (!enabled) {
            releasePointer();
        }
        toggleElement.setAttribute('aria-pressed', String(enabled));
        const label = enabled ? 'Hide joystick (J)' : 'Show joystick (J)';
        toggleElement.title = label;
        toggleElement.setAttribute('aria-label', label);
    }

    function toggle() {
        setEnabled(!isEnabled);
        writeStoredChoice(isEnabled ? STORED_SHOWN : STORED_HIDDEN);
    }

    function createToggle() {
        toggleElement = document.createElement('button');
        toggleElement.id = 'joystick-toggle';
        toggleElement.type = 'button';
        // A stick-and-base glyph; currentColor follows the CSS on/off state.
        toggleElement.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<circle cx="12" cy="12" r="4" fill="currentColor"/></svg>';

        // The engine reads keys only when event.target === document.body, so a
        // focused button would silently swallow arrow steering. Never take focus.
        toggleElement.tabIndex = -1;
        toggleElement.addEventListener('pointerdown', (event) => {
            event.preventDefault();
        });
        toggleElement.addEventListener('mousedown', (event) => {
            event.preventDefault();
        });
        toggleElement.addEventListener('click', () => {
            toggle();
            toggleElement.blur();
        });

        document.body.appendChild(toggleElement);
    }

    function onToggleKeyDown(event) {
        if (event.code !== TOGGLE_KEY_CODE || event.repeat) {
            return;
        }
        if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
            return;
        }
        if (event.target.closest && event.target.closest(TEXT_ENTRY_SELECTOR)) {
            return;
        }
        toggle();
    }

    function createJoystick() {
        baseElement = document.createElement('div');
        baseElement.id = 'joystick';
        baseElement.style.display = 'none';

        knobElement = document.createElement('div');
        knobElement.id = 'joystick-knob';

        baseElement.appendChild(knobElement);
        document.body.appendChild(baseElement);

        // Listen on the window so a touch anywhere in the play area spawns the
        // stick under the finger (the base itself is hidden until then).
        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerDown(event) {
        if (!isEnabled || activePointerId !== null) {
            return;
        }
        // On desktop only the main (left) button summons the stick.
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }
        if (event.target.closest && event.target.closest(NON_GAME_TARGET_SELECTOR)) {
            return;
        }
        event.preventDefault();
        activePointerId = event.pointerId;

        centerX = event.clientX;
        centerY = event.clientY;
        // Place the base centered on the touch point (CSS centers it via transform).
        baseElement.style.left = `${centerX}px`;
        baseElement.style.top = `${centerY}px`;
        baseElement.style.display = 'flex';
        radius = baseElement.getBoundingClientRect().width / 2;

        updateFromPointer(event.clientX, event.clientY);
    }

    function onPointerMove(event) {
        if (event.pointerId !== activePointerId) {
            return;
        }
        event.preventDefault();
        updateFromPointer(event.clientX, event.clientY);
    }

    function onPointerUp(event) {
        if (event.pointerId !== activePointerId) {
            return;
        }
        releasePointer();
    }

    function releasePointer() {
        activePointerId = null;
        baseElement.style.display = 'none';
        resetKnob();
        // Release all held keys; the game keeps the player moving in its current
        // heading, so lifting the finger simply stops issuing new turns.
        applyKeys([]);
    }

    function updateFromPointer(pointerX, pointerY) {
        const deltaX = pointerX - centerX;
        const deltaY = pointerY - centerY;
        const distance = Math.hypot(deltaX, deltaY);

        moveKnob(deltaX, deltaY, distance);

        if (distance < radius * DEADZONE_RATIO) {
            applyKeys([]);
            return;
        }

        applyKeys(SECTOR_KEYS[sectorFor(deltaX, deltaY)]);
    }

    function sectorFor(deltaX, deltaY) {
        // Math-convention angle with up positive (screen Y grows downward, so negate).
        const angle = Math.atan2(-deltaY, deltaX);
        const sector = Math.round(angle / SECTOR_ANGLE_RADIANS);
        // atan2 returns -PI..PI, so sector is -4..4; wrap into 0..SECTOR_COUNT-1.
        return ((sector % SECTOR_COUNT) + SECTOR_COUNT) % SECTOR_COUNT;
    }

    function applyKeys(desiredList) {
        const desired = new Set(desiredList);
        for (const keyCode of heldKeys) {
            if (!desired.has(keyCode)) {
                dispatchKey('keyup', keyCode);
                heldKeys.delete(keyCode);
            }
        }
        for (const keyCode of desired) {
            if (!heldKeys.has(keyCode)) {
                dispatchKey('keydown', keyCode);
                heldKeys.add(keyCode);
            }
        }
    }

    function moveKnob(deltaX, deltaY, distance) {
        let offsetX = deltaX;
        let offsetY = deltaY;
        if (distance > radius) {
            const scale = radius / distance;
            offsetX = deltaX * scale;
            offsetY = deltaY * scale;
        }
        knobElement.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }

    function resetKnob() {
        knobElement.style.transform = 'translate(0px, 0px)';
    }

    function dispatchKey(type, keyCode) {
        const event = new KeyboardEvent(type, { bubbles: true, cancelable: true });
        // KeyboardEvent ignores keyCode/which passed to its constructor (they are
        // legacy read-only accessors), so force them — the game reads event.keyCode.
        Object.defineProperty(event, 'keyCode', { get: () => keyCode });
        Object.defineProperty(event, 'which', { get: () => keyCode });
        document.body.dispatchEvent(event);
    }
})();
