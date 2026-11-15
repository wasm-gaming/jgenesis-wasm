// jgenesis-wasm against the built package: the engine's folder, the spec, and the
// gamepad → key bridge (upstream's web build reads only the keyboard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JgenesisSDK, { storagePath, padKeys, JGENESIS_PAD_KEYS, JGENESIS_SPEC, STATE_SLOTS, AUTO_STATE_SLOT } from '../dist/jgenesis/jgenesis.sdk.js';

test('the engine owns its folder', () => {
  assert.equal(JgenesisSDK.id, 'jgenesis');
  assert.deepEqual(storagePath('jgenesis', 'sonic'), { namespace: 'sonic', path: 'jgenesis/sonic', prefixed: false });
  assert.deepEqual(storagePath('jgenesis', '../x'), { namespace: 'x', path: 'jgenesis/x', prefixed: false });
  assert.deepEqual(storagePath('jgenesis', undefined).path, 'jgenesis/default');
  assert.deepEqual(storagePath('jgenesis', 'jgenesis/Sonic'), { namespace: 'Sonic', path: 'jgenesis/Sonic', prefixed: true });
});

test('slots like the other engines', () => {
  assert.equal(STATE_SLOTS, 4);
  assert.equal(AUTO_STATE_SLOT, 9);
});

test('the spec carries the settings catalog and the ROM hints', () => {
  assert.equal(JGENESIS_SPEC.options.romFileName.default, undefined, 'a default would override the console hint');
  assert.deepEqual(JGENESIS_SPEC.options.console.enum, ['megadrive', 'snes', 'sms', 'gg', 'nes', 'gba']);
  assert.equal(JGENESIS_SPEC.options.escMenu.default, true);
  assert.equal(JGENESIS_SPEC.storage.namespace.default, 'default');
});

const pad = (pressed = [], axes = [0, 0, 0, 0]) => ({
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
  axes,
});

test("a pad presses jgenesis' default keys, per system", () => {
  // Mega Drive: A B C on 0 1 5, X Y Z on 2 3 4 (as BlastEm and the touch layout).
  assert.deepEqual([...padKeys('genesis', pad([0, 1, 5, 2, 3, 4, 9]))].sort(), ['Enter', 'KeyA', 'KeyD', 'KeyE', 'KeyQ', 'KeyS', 'KeyW'].sort());
  // SNES by position: B 0 → X key, A 1 → S, Y 2 → Z, X 3 → A, L 4 → D, R 5 → C.
  assert.deepEqual([...padKeys('snes', pad([0, 1, 2, 3, 4, 5]))].sort(), ['KeyA', 'KeyC', 'KeyD', 'KeyS', 'KeyX', 'KeyZ']);
  assert.deepEqual([...padKeys('gba', pad([0, 1]))].sort(), ['KeyA', 'KeyS']);
});

test('the d-pad and the left stick are the arrows; nothing held, nothing pressed', () => {
  assert.deepEqual([...padKeys('snes', pad([12, 15]))].sort(), ['ArrowRight', 'ArrowUp']);
  assert.deepEqual([...padKeys('genesis', pad([], [-1, 0.9]))].sort(), ['ArrowDown', 'ArrowLeft']);
  assert.equal(padKeys('genesis', pad()).size, 0);
  assert.equal(padKeys('genesis', null).size, 0);
  for (const map of Object.values(JGENESIS_PAD_KEYS)) for (const code of Object.values(map)) assert.match(code, /^(Key[A-Z]|Enter|ShiftRight)$/);
});
