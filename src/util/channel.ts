import { setSecret } from "./secret";
import { 
  isObj, toB64urlQuery, fromB64urlQuery
} from "../b64url/index";

import type {
  NodeAny, TreeAny
} from "../b64url/index";
import type { Git } from "../util/secret";

export type ClientOpts = {
  env: string,
  git: Git
};
export type ServerOpts = ClientOpts & {
  secrets?: string,
}

type EFn = (a: Error) => void;
type Fn = (s: TreeAny) => void;
type Choice = { yes: Fn, no: EFn };
type INS = Map<string, TreeAny>;
type KV = [string, TreeAny];
type KN = [string, NodeAny];

const isTree = (n: NodeAny): n is TreeAny => {
  return isObj(n);
}

const parseTree = (s: string): KV[] => {
  const o: KV[]  = [];
  const i = deserialize(s);
  if (!isTree(i)) return o;
  Object.entries(i).forEach(([k,v]: KN) => {
    if (isTree(v)) o.push([k, v]);
  });
  return o;
}

const serialize = (data: TreeAny): string => {
  return toB64urlQuery(data);
}

const deserialize = (str: string): TreeAny => {
  return fromB64urlQuery(str);
}

class ClientChannel {

  waiters: Map<string, Choice>;
  done: boolean;
  env: string;
  git: Git;
  ins: INS;

  constructor(opts: ClientOpts) {
    this.ins = new Map();
    this.waiters = new Map();
    this.env = opts.env;
    this.git = opts.git;
    this.done = false;
    this.seek();
  }
  async listPublic(): Promise<string> {
    return ""; //TODO
  }
  async seek() {
    while (!this.done) {
      const str = await this.listPublic();
      const tree = parseTree(str);
      tree.forEach(([k,v]: KV) => {
        this.ins.set(k, v);
        this.choose(k, v);
      });
    }
  }
  has(k: string): boolean {
    return this.ins.has(k);
  }
  get(k: string): TreeAny {
    const v = this.ins.get(k);
    if (v) return v;
    throw new Error(`Missing ${k}`);
  }
  wait(k: string) {
    return new Promise((yes: Fn, no: EFn) => {
      console.log(`Awaiting ${k}`);
      if (this.waiters.has(k)) {
        no(new Error(`Duplicate ${k} getter.`));
      }
      this.waiters.set(k, { yes, no });
    })
  }
  sendToServer(name: string, a: TreeAny) {
    const { git, env } = this;
    const secret = serialize(a);
    setSecret({ name, secret, git, env });
  }
  choose(k: string, value?: TreeAny) {
    const use = this.waiters.get(k);
    if (use) {
      this.waiters.delete(k);
      if (value) return use.yes(value);
      const msg = `Unable to resolve ${k}.`;
      return use.no(new Error(msg));
    }
  }
  async access(k: string): Promise<TreeAny> {
    if (this.has(k)) {
      const v = this.get(k);
      console.log(`Resolving ${k}`);
      this.choose(k);
      return v;
    }
    return this.wait(k);
  }
  finish() {
    this.done = true;
    const keys = this.waiters.keys();
    [...keys].forEach((k: string) => {
      this.choose(k);
    });
  }
}

class ServerChannel {

  env: string;
  git: Git;
  ins: INS;
  outs: INS;

  constructor(opts: ServerOpts) {
    const sec = opts.secrets || "";
    this.ins = new Map(parseTree(sec));
    this.outs = new Map();
    this.env = opts.env;
    this.git = opts.git;
  }
  async listSecrets(): Promise<string[]> {
    return []; //TODO
  }
  async find(ends: string[]) {
    const remains = new Set(ends);
    while (remains.size > 0) {
      const items = await this.listSecrets();
      for (const k of items) {
        remains.delete(k);
      }
    }
  }
  has(k: string): boolean {
    return this.ins.has(k);
  }
  get(k: string): TreeAny {
    const v = this.ins.get(k);
    if (v) return v;
    throw new Error(`Missing ${k}`);
  }
  get output(): string {
    const e = this.outs.entries();
    return serialize(Object.fromEntries(e));
  }
  addOutput(k: string, a: TreeAny) {
    this.outs.set(k, a);
  }
}

export { ServerChannel, ClientChannel };
