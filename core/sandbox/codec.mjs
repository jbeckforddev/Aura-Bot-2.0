import { serialize, deserialize } from "node:v8";

function sanitize(value, seen = new WeakMap()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "undefined"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }

  if (typeof value === "symbol") {
    return `[Symbol: ${value.description || ""}]`;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (Buffer.isBuffer(value)) {
    const result = Buffer.from(value);
    seen.set(value, result);
    return result;
  }

  if (value instanceof Date) {
    const result = new Date(value.getTime());
    seen.set(value, result);
    return result;
  }

  if (value instanceof RegExp) {
    const result = new RegExp(value.source, value.flags);
    result.lastIndex = value.lastIndex;
    seen.set(value, result);
    return result;
  }

  if (value instanceof Error) {
    const result = new Error(value.message);
    seen.set(value, result);

    result.name = value.name;
    result.stack = value.stack;

    if (value.cause !== undefined) {
      result.cause = sanitize(value.cause, seen);
    }

    for (const key of Object.keys(value)) {
      try {
        result[key] = sanitize(value[key], seen);
      } catch {
        result[key] = "[Unserializable property]";
      }
    }

    return result;
  }

  if (value instanceof Map) {
    const result = new Map();
    seen.set(value, result);

    for (const [key, item] of value) {
      result.set(
        sanitize(key, seen),
        sanitize(item, seen)
      );
    }

    return result;
  }

  if (value instanceof Set) {
    const result = new Set();
    seen.set(value, result);

    for (const item of value) {
      result.add(sanitize(item, seen));
    }

    return result;
  }

  if (value instanceof ArrayBuffer) {
    const result = value.slice(0);
    seen.set(value, result);
    return result;
  }

  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      const result = new DataView(
        value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength
        )
      );

      seen.set(value, result);
      return result;
    }

    const result = new value.constructor(value);
    seen.set(value, result);
    return result;
  }

  if (Array.isArray(value)) {
    const result = [];
    seen.set(value, result);

    for (const item of value) {
      result.push(sanitize(item, seen));
    }

    return result;
  }

  const result = {};
  seen.set(value, result);

  for (const key of Object.keys(value)) {
    try {
      result[key] = sanitize(value[key], seen);
    } catch {
      result[key] = "[Unserializable property]";
    }
  }

  return result;
}

export function encode(value) {
  return serialize(sanitize(value));
}

export function decode(value) {
  return deserialize(
    Buffer.isBuffer(value)
      ? value
      : Buffer.from(value)
  );
}