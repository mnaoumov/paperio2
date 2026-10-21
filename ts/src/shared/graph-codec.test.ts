import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  DecodeGraphOptions,
  EncodeGraphOptions
} from './graph-codec.ts';

import {
  decodeGraph,
  encodeGraph
} from './graph-codec.ts';

interface BothNodes {
  both: Node2[];
  first: Node2;
}

interface Items {
  items: unknown[];
}

interface Shared {
  list: unknown[];
  shared: unknown;
}

class Node2 {
  public next: Node2 | null = null;
  public value = 0;
}

class Unregistered {
  public value = 1;
}

const ENCODE: EncodeGraphOptions = { classNames: new Map([[Node2.prototype, 'Node2']]) };
const DECODE: DecodeGraphOptions = { classPrototypes: new Map([['Node2', Node2.prototype]]) };

function roundTrip(value: unknown, encode: EncodeGraphOptions = ENCODE, decode: DecodeGraphOptions = DECODE): unknown {
  const encoded: unknown = JSON.parse(JSON.stringify(encodeGraph(value, encode)));
  return decodeGraph(encoded as ReturnType<typeof encodeGraph>, decode);
}

describe('graph codec', () => {
  it('keeps identity, cycles and class prototypes', () => {
    const first = new Node2();
    const second = new Node2();
    first.next = second;
    second.next = first;
    second.value = 2;
    const decoded = roundTrip({ both: [first, second], first });
    expect(decoded).toBeInstanceOf(Object);
    const { both, first: decodedFirst } = decoded as BothNodes;
    expect(decodedFirst).toBeInstanceOf(Node2);
    expect(both[0]).toBe(decodedFirst);
    expect(decodedFirst.next).toBe(both[1]);
    expect(decodedFirst.next?.next).toBe(decodedFirst);
    expect(both[1]?.value).toBe(2);
  });

  it('keeps the numbers and undefined JSON cannot hold', () => {
    const decoded = roundTrip({ items: [Infinity, -Infinity, NaN, -0, 0, 1.5, undefined, null, 'text', true] }) as Items;
    expect(decoded.items).toEqual([Infinity, -Infinity, NaN, -0, 0, 1.5, undefined, null, 'text', true]);
    expect(Object.is(decoded.items[3], -0)).toBe(true);
  });

  it('encodes a chain far deeper than the call stack without recursion', () => {
    const head = new Node2();
    let tail = head;
    for (let index = 1; index < 200_000; index++) {
      tail.next = new Node2();
      tail = tail.next;
      tail.value = index;
    }
    let node = roundTrip(head) as Node2 | null;
    let count = 0;
    while (node) {
      expect(node.value).toBe(count);
      count++;
      node = node.next;
    }
    expect(count).toBe(200_000);
  });

  it('hands external objects to the caller by tag', () => {
    const shared = { name: 'outside' };
    const owners: object[] = [];
    const decoded = roundTrip(
      { list: [shared], shared },
      { ...ENCODE, encodeExternal: (value: object) => (value === shared ? 'the-shared-one' : undefined) },
      {
        ...DECODE,
        decodeExternal: (tag: unknown, owner: object) => {
          owners.push(owner);
          return tag === 'the-shared-one' ? shared : null;
        }
      }
    ) as Shared;
    expect(decoded.shared).toBe(shared);
    expect(decoded.list[0]).toBe(shared);
    expect(owners).toHaveLength(2);
  });

  it('refuses an instance of an unregistered class and a function', () => {
    expect(() => encodeGraph({ value: new Unregistered() }, ENCODE)).toThrow('Unregistered');
    expect(() => encodeGraph({ callback: (): void => undefined }, ENCODE)).toThrow('function');
  });
});
