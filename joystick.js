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

    let baseElement = null;
    let knobElement = null;
    let activePointerId = null;
    const heldKeys = new Set();
    let centerX = 0;
    let centerY = 0;
    let radius = 0;

    init();

    function init() {
        const isTouchLikely =
            window.matchMedia('(pointer: coarse)').matches ||
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0 ||
            window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
        if (!isTouchLikely) {
            return;
        }
        createJoystick();
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
        if (activePointerId !== null) {
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
