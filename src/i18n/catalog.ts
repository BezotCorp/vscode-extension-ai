import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Layout written by tools/rust/internationalization, all integers little-endian:
//   "BZTI18N" | version u16 | count u32 | count x entry
//   entry = namespace length u16 | namespace | key length u16 | key | value length u32 | value   (UTF-8)
const MAGIC = Buffer.from('BZTI18N', 'ascii');
const VERSION = 2;
const HEADER_SIZE = MAGIC.length + 2 + 4;
const EXTENSION = '.bin';

type Namespaces = ReadonlyMap<string, ReadonlyMap<string, string>>;

const catalogs = new Map<string, Namespaces>();
let localeCache: string[] | undefined;

// The catalogs sit next to this file once compiled (dist/i18n).
export function availableLocales(): string[] {
  localeCache ??= readdirSync(__dirname)
    .filter((file) => file.endsWith(EXTENSION))
    .map((file) => file.slice(0, -EXTENSION.length))
    .sort();
  return localeCache;
}

export function lookup(locale: string, namespace: string, key: string): string | undefined {
  return load(locale).get(namespace)?.get(key);
}

export function namespaceMessages(locale: string, namespace: string): ReadonlyMap<string, string> {
  return load(locale).get(namespace) ?? new Map();
}

function load(locale: string): Namespaces {
  const cached = catalogs.get(locale);

  if (cached) {
    return cached;
  }

  const catalog = parse(path.resolve(__dirname, `${locale}${EXTENSION}`));

  catalogs.set(locale, catalog);

  return catalog;
}

function parse(file: string): Namespaces {
  const buffer = readFileSync(file);

  if (buffer.length < HEADER_SIZE || !buffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error(`Invalid i18n catalog: ${file}`);
  }

  let offset = MAGIC.length;
  const version = buffer.readUInt16LE(offset);

  offset += 2;

  if (version !== VERSION) {
    throw new Error(`Unsupported i18n catalog version ${version}: ${file}`);
  }

  const count = buffer.readUInt32LE(offset);

  offset += 4;

  const namespaces = new Map<string, Map<string, string>>();

  const text = (size: number): string => {
    if (offset + size > buffer.length) {
      throw new Error(`Truncated i18n catalog: ${file}`);
    }

    const value = buffer.subarray(offset, offset + size).toString('utf8');

    offset += size;

    return value;
  };
  const size = (bytes: 2 | 4): number => {
    if (offset + bytes > buffer.length) {
      throw new Error(`Truncated i18n catalog: ${file}`);
    }

    const value = bytes === 2 ? buffer.readUInt16LE(offset) : buffer.readUInt32LE(offset);

    offset += bytes;

    return value;
  };

  for (let index = 0; index < count; index += 1) {
    const namespace = text(size(2));
    const key = text(size(2));
    const value = text(size(4));
    const messages = namespaces.get(namespace) ?? new Map<string, string>();

    messages.set(key, value);
    namespaces.set(namespace, messages);
  }

  if (offset !== buffer.length) {
    throw new Error(`Unexpected trailing i18n data: ${file}`);
  }

  return namespaces;
}
