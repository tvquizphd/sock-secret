type Obj<T> = Record<string, T>;
type ObjAny = Obj<any>;
type ObjStr = Obj<string>;

export type TreeAny = {
  [k: string]: TreeAny | boolean | Uint8Array | string;
}
export type NodeAny = TreeAny | boolean | Uint8Array | string;

export type CommandTreeList = NameTree[];
interface ToCommandTreeList {
  (t: string): CommandTreeList;
}
interface FromCommandTreeList {
  (t: CommandTreeList): string;
}
export type NameTree = {
  command: string,
  tree: TreeAny
} 
interface ToNameTree {
  (t: string): NameTree;
}
interface FromNameTree {
  (t: NameTree): string;
}
type TreeStr = {
  [k: string]: TreeStr | string;
}
type NodeStr = TreeStr | string;

interface ToB64Q {
  (o: TreeAny, pre?: string[]): string;
}
interface FromB64Q {
  (s: string): TreeAny;
}

const isBytes = (o: any): o is Uint8Array => {
  return ArrayBuffer.isView(o);
}
export const isObj = (o: any): o is ObjAny => {
  return typeof o === "object";
}

const chars = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789-_'
].join('');

const lookup = ((str: string) => {
  const out = new Uint8Array(256);
  for (let i = 0; i < str.length; i++) {
    out[str.charCodeAt(i)] = i;
  }
  return out;
})(chars);

const toB64url = (bytes: Uint8Array): string => {
  const len = bytes.length;
  let str = '';

  for (let i = 0; i < len; i += 3) {
    str += chars[bytes[i] >> 2];
    str += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    str += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    str += chars[bytes[i + 2] & 63];
  }
  if (len % 3 === 2) {
    str = str.substring(0, str.length - 1) + '=';
  } else if (len % 3 === 1) {
    str = str.substring(0, str.length - 2) + '==';
  }
  return str;
}

const fromB64url = (str: string): Uint8Array => {
  const len = str.length;
  let bufferLength = str.length * 0.75;

  if (str[str.length - 1] === '=') {
    bufferLength--;
    if (str[str.length - 2] === '=') {
      bufferLength--;
    }
  }
  const arraybuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arraybuffer);
  let p = 0;

  for (let i = 0; i < len; i += 4) {
    const encoded1 = lookup[str.charCodeAt(i)];
    const encoded2 = lookup[str.charCodeAt(i + 1)];
    const encoded3 = lookup[str.charCodeAt(i + 2)];
    const encoded4 = lookup[str.charCodeAt(i + 3)];
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }
  return bytes;
}

const toB64val = (v: NodeAny): NodeStr => {
  if (isBytes(v)) {
    return ":" + toB64url(v);
  }
  else if (isObj(v)) {
    return toB64urlObj(v);
  }
  return `${v}`;
}

const toB64urlObj = (o: TreeAny): TreeStr => {
  const entries = Object.entries(o);
  return entries.reduce((out, [k, v]) => {
    return {...out, [k]: toB64val(v)};
  }, {});
}

const fromB64val = (v: NodeStr): NodeAny => {
  if (typeof v === "string" && v[0] === ":") {
    const val = v.slice(1);
    if (!val.match(/[^0-9a-zA-Z=_-]/)) {
      return fromB64url(val);
    }
  }
  if (isObj(v)) {
    return fromB64urlObj(v);
  }
  if (v == "true") {
    return true;
  }
  if (v == "false") {
    return false;
  }
  return v;
}

const nester = (params: ObjStr): TreeStr => {
  const keyLists = Object.keys(params).map(k => {
    const l = k.split('.');
    return {k, l, len: l.length};
  });
  const keys = keyLists.sort((a, b) => a.len - b.len);
  return keys.reduce((o, {k, l, len}) => {
    let node: TreeStr = o;
    for (let i = 0; i < len - 1; i++) {
      if (!(l[i] in node)) {
        node[l[i]] = {};
      }
      node = node[l[i]] as TreeStr;
    }
    const last = l.slice(-1)[0];
    node[last] = params[k];
    return o;
  }, {});
}

const fromB64urlObj = (o: NodeStr): TreeAny => {
  const entries = Object.entries(o);
  return entries.reduce((out, [k, v]) => {
    return {...out, [k]: fromB64val(v)};
  }, {});
}

const _toB64urlQuery: ToB64Q = (o, pre=[]) => {
  const entries = Object.entries(toB64urlObj(o));
  return entries.reduce((out, [k, v]) => {
    const keys = [...pre, k];
    const key = keys.join('.');
    if (isObj(v)) {
      const value = _toB64urlQuery(v, keys);
      return `${out}${value}`;
    }
    return `${out}#${key}=${v}`;
  }, '');
}

const toB64urlQuery = (o: TreeAny) => {
  return _toB64urlQuery(o);
}

const toPair = (o: ObjStr, s: string): ObjStr => {
  const [k, v] = s.split("=");
  o[k] = v || "";
  return o;
}

const fromB64urlQuery: FromB64Q = (hash) => {
  const pairs = hash.slice(1).split("#");
  const obj: ObjStr = {};
  pairs.reduce(toPair, obj);
  return fromB64urlObj(nester(obj));
}

const toNameTree: ToNameTree = (s) => {
  const trio = s.split(/(#.*)/s);
  if (!s.length) {
    return { command: "", tree: {} }
  }
  if (trio.length !== 3) {
    throw new Error('Poorly formatted command');
  }
  const [command, rest] = trio;
  const tree = fromB64urlQuery(rest);
  return { command, tree };
}

const fromNameTree: FromNameTree = ({ command, tree }) => {
  return command + toB64urlQuery(tree);
}

const fromCommandTreeList: FromCommandTreeList = (ctl) => {
  return ctl.map(fromNameTree).join('/');
}

const toCommandTreeList: ToCommandTreeList = (text) => {
  const list = text.split(/\s+/).slice(0,1).join('').split('/');
  return list.map(line => {
    return toNameTree(line);
  });
}

export {
  toNameTree,
  fromNameTree,
  toB64urlQuery,
  fromB64urlQuery,
  toCommandTreeList,
  fromCommandTreeList
}
