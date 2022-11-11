import { setSecret } from "./secret";
import { toB64urlQuery, fromB64urlQuery } from "../b64url/index";

import type { TreeAny } from "../b64url/index";
import type { Git } from "../util/secret";

export type ChannelOptions = {
  env: string,
  git: Git
};
type ItemObject = Record<string, Item>;
type Item = { k: string, v: string };
type Resolve = (s: string) => void;
type Fn = (a: TreeAny) => void;

const serialize = (data: TreeAny): string => {
  return toB64urlQuery(data);
}

const deserialize = (str: string): TreeAny => {
  return fromB64urlQuery(str);
}

class SecretChannel {

  waitMap: Map<string, Resolve>;
  items: Item[];
  env: string;
  git: Git;

  constructor(opts: ChannelOptions) {
    this.waitMap = new Map();
    this.env = opts.env;
    this.git = opts.git;
    this.items = [];
  }
  get itemObject(): ItemObject {
    return this.items.reduce((o, i) => {
      return {...o, [i.k]: i};
    }, {})
  }
  hasResponse(k: string) {
    return k in this.itemObject;
  }
  listenForKey(k: string, res: Fn) {
    const r = (s: string) => res(deserialize(s));
    this.awaitItem(k, r);
  }
  receiveKey(k: string, res: Fn) {
    const r = (s: string) => res(deserialize(s));
    this.resolver(k, r);
  }
  sendMail(name: string, a: TreeAny) {
    const { git, env } = this;
    const secret = serialize(a);
    setSecret({ name, secret, git, env });
  }
  awaitItem(k: string, resolve: Resolve) {
    console.log(`Awaiting ${k}`);
    if (this.waitMap.has(k)) {
      throw new Error(`Repeated ${k} handler`);
    }
    this.waitMap.set(k, resolve);
  }
  resolver(k: string, resolve: Resolve) {
    const itemObject = this.itemObject;
    if (k in itemObject) {
      const { v } = itemObject[k];
      console.log(`Resolving ${k}`);
      if (this.waitMap.has(k)) {
        this.waitMap.delete(k);
      }
      resolve(v);
    }
  }
}

export { SecretChannel };
