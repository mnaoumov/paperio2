/**
 * @file
 *
 * Encodes an object graph as JSON and back, keeping identity, cycles and class prototypes: the save format's core.
 * Every object becomes one entry of a flat table, and a reference to it becomes its index, so a chain thousands of
 * objects deep is encoded without recursion. Classes are named through a registry rather than by
 * `constructor.name`, which a minifier would rename. Numbers JSON cannot hold (infinities, NaN, -0) and `undefined`
 * are tagged.
 *
 * What the registry does not know is handed to the caller's `encodeExternal`, which returns a tag for an object
 * that lives outside the graph (the game, a skin), and the decoder's `decodeExternal` turns the tag back.
 */

export interface DecodeGraphOptions {
  /** Each class's prototype by registry name. */
  readonly classPrototypes: ReadonlyMap<string, object>;
  /**
   * Turns a tag from `encodeExternal` back into the object.
   *
   * @param tag - The tag.
   * @param owner - The object or array that holds the reference.
   * @returns The object.
   */
  readonly decodeExternal?: (tag: unknown, owner: object) => unknown;
}

export interface EncodedGraph {
  readonly objects: readonly EncodedObject[];
  readonly root: EncodedValue;
}

export interface EncodedObject {
  /** The registry name of the object's class; absent for a plain object. */
  readonly className?: string;
  /** An array's items; absent for an object. */
  readonly items?: readonly EncodedValue[];
  /** An object's own enumerable properties. */
  readonly properties?: Readonly<Record<string, EncodedValue>>;
}

export interface EncodedTag {
  /** An external object, by the caller's tag. */
  readonly external?: unknown;
  /** A non-finite number or -0. */
  readonly number?: '-0' | '-Infinity' | 'Infinity' | 'NaN';
  /** A reference: the index of an entry in {@link EncodedGraph.objects}. */
  readonly ref?: number;
  readonly undefined?: true;
}

export type EncodedValue = boolean | EncodedTag | null | number | string;

export interface EncodeGraphOptions {
  /** Names the class of each instance the graph may hold. A prototype missing from it is an error. */
  readonly classNames: ReadonlyMap<object, string>;
  /**
   * Returns the tag for an object kept outside the graph, or `undefined` to encode it as part of the graph.
   *
   * @param value - The object.
   * @returns Its tag, which must survive `JSON.stringify`.
   */
  readonly encodeExternal?: (value: object) => unknown;
}

/**
 * Decodes a graph from {@link encodeGraph}.
 *
 * @param graph - The encoding.
 * @param options - The class registry and the external objects.
 * @returns The graph's root value.
 */
export function decodeGraph(graph: EncodedGraph, options: DecodeGraphOptions): unknown {
  const targets: object[] = graph.objects.map((encoded: EncodedObject) => {
    if (encoded.items) {
      return [];
    }
    if (encoded.className === undefined) {
      return {};
    }
    const prototype = options.classPrototypes.get(encoded.className);
    if (!prototype) {
      throw new Error(`Cannot decode an instance of an unknown class: ${encoded.className}`);
    }
    return Object.create<object>(prototype);
  });
  function decodeValue(value: EncodedValue, owner: object | undefined): unknown {
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    if (value.ref !== undefined) {
      const target = targets[value.ref];
      if (!target) {
        throw new Error(`Dangling reference ${String(value.ref)}`);
      }
      return target;
    }
    if (value.number !== undefined) {
      return decodeNumber(value.number);
    }
    if (value.undefined) {
      return undefined;
    }
    if ('external' in value) {
      if (!options.decodeExternal || !owner) {
        throw new Error('An external reference needs decodeExternal');
      }
      return options.decodeExternal(value.external, owner);
    }
    throw new Error(`Unknown tag: ${JSON.stringify(value)}`);
  }
  graph.objects.forEach((encoded: EncodedObject, index: number) => {
    const target = targets[index];
    if (!target) {
      throw new Error('Unreachable: one target per encoded object');
    }
    if (encoded.items && Array.isArray(target)) {
      for (const item of encoded.items) {
        target.push(decodeValue(item, target));
      }
      return;
    }
    for (const [key, item] of Object.entries(encoded.properties ?? {})) {
      Reflect.set(target, key, decodeValue(item, target));
    }
  });
  return decodeValue(graph.root, undefined);
}

/**
 * Encodes a graph.
 *
 * @param root - The graph's root value.
 * @param options - The class registry and the external objects.
 * @returns The encoding, ready for `JSON.stringify`.
 */
export function encodeGraph(root: unknown, options: EncodeGraphOptions): EncodedGraph {
  const indexes = new Map<object, number>();
  const sources: object[] = [];
  const objects: EncodedObject[] = [];
  function encodeValue(value: unknown): EncodedValue {
    switch (typeof value) {
      case 'boolean':
      case 'string':
        return value;
      case 'function': {
        const tag = options.encodeExternal?.(value);
        if (tag === undefined) {
          throw new Error('Cannot encode a function');
        }
        return { external: tag };
      }
      case 'number':
        return encodeNumber(value);
      case 'object':
        return value === null ? null : encodeObject(value);
      case 'undefined':
        return { undefined: true };
      default:
        throw new Error(`Cannot encode a ${typeof value}`);
    }
  }
  function encodeObject(value: object): EncodedTag {
    const existing = indexes.get(value);
    if (existing !== undefined) {
      return { ref: existing };
    }
    const tag = options.encodeExternal?.(value);
    if (tag !== undefined) {
      return { external: tag };
    }
    const index = sources.length;
    indexes.set(value, index);
    sources.push(value);
    return { ref: index };
  }
  const encodedRoot = encodeValue(root);
  // `sources` grows as the loop encodes references, and an array iterator reads the new length on each step.
  for (const source of sources) {
    if (Array.isArray(source)) {
      objects.push({ items: source.map((item: unknown) => encodeValue(item)) });
      continue;
    }
    const prototype = Reflect.getPrototypeOf(source);
    const properties: Record<string, EncodedValue> = {};
    for (const key of Object.keys(source)) {
      properties[key] = encodeValue(Reflect.get(source, key));
    }
    if (prototype === Object.prototype) {
      objects.push({ properties });
      continue;
    }
    const className = prototype === null ? undefined : options.classNames.get(prototype);
    if (className === undefined) {
      throw new Error(`Cannot encode an instance of an unregistered class: ${describePrototype(prototype)}`);
    }
    objects.push({ className, properties });
  }
  return { objects, root: encodedRoot };
}

function decodeNumber(tag: NonNullable<EncodedTag['number']>): number {
  switch (tag) {
    case '-0':
      return -0;
    case '-Infinity':
      return -Infinity;
    case 'Infinity':
      return Infinity;
    case 'NaN':
      return NaN;
    default:
      throw new Error(`Unknown number tag: ${String(tag)}`);
  }
}

function describePrototype(prototype: null | object): string {
  if (prototype === null) {
    return 'null prototype';
  }
  const constructor: unknown = Reflect.get(prototype, 'constructor');
  return typeof constructor === 'function' ? constructor.name : 'anonymous';
}

function encodeNumber(value: number): EncodedValue {
  if (Number.isNaN(value)) {
    return { number: 'NaN' };
  }
  if (value === Infinity) {
    return { number: 'Infinity' };
  }
  if (value === -Infinity) {
    return { number: '-Infinity' };
  }
  if (Object.is(value, -0)) {
    return { number: '-0' };
  }
  return value;
}
