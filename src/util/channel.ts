import { listSecrets, setSecret } from "./secret";
import {
  isObj, toB64urlQuery
} from "../b64url/index";

import type {
  NodeAny, TreeAny
} from "../b64url/index";
import type { NamedSecret, Git, Lister } from "./secret";

type Opts = {
  env: string,
  git: Git
};
type Sender = (ns: NamedSecret) => unknown;
type Seeker = () => Promise<TreeAny>;
export type ClientOpts = Opts & {
  sender?: Sender | null,
  seeker?: Seeker
};
export type ServerOpts = Opts & {
  lister?: Lister | null,
  secrets?: TreeAny
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

const parseTree = (t: TreeAny): KV[] => {
  const o: KV[]  = [];
  if (!isTree(t)) return o;
  Object.entries(t).forEach(([k,v]: KN) => {
    if (isTree(v)) o.push([k, v]);
  });
  return o;
}

const serialize = (data: TreeAny): string => {
  return toB64urlQuery(data);
}

class ClientChannel {

  waiters: Map<string, Choice>;
  sender: Sender | null;
  seeker: Seeker;
  done: boolean;
  env: string;
  git: Git;
  ins: INS;

  constructor(opts: ClientOpts) {
    const no: Seeker = async () => {
      return {} as TreeAny;
    };
    this.sender = opts.sender || null;
    this.seeker = opts.seeker || no;
    this.waiters = new Map();
    this.ins = new Map();
    this.env = opts.env;
    this.git = opts.git;
    this.done = false;
    this.seek();
  }
  async seek() {
    const dt = 100; //TODO
    while (!this.done) {
      const tree = await this.seeker();
      const kvs = parseTree(tree);
      kvs.forEach(([k,v]: KV) => {
        this.ins.set(k, v);
        this.choose(k, v);
      });
      await new Promise(r => setTimeout(r, dt));
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
    if (this.sender !== null) {
      this.sender({ name, secret });
    }
    else {
      setSecret({ name, secret, git, env });
    }
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

  lister: Lister | null;
  env: string;
  git: Git;
  ins: INS;
  outs: INS;

  constructor(opts: ServerOpts) {
    const sec = opts.secrets || {};
    this.lister = opts.lister || null;
    this.ins = new Map(parseTree(sec));
    this.outs = new Map();
    this.env = opts.env;
    this.git = opts.git;
  }
  async find(ends: string[]) {
    const remains = new Set(ends);
    const { git, env } = this;
    const opts = { git, env };
    const lister = async () => {
      if (this.lister !== null) {
        return await this.lister();
      }
      return await listSecrets(opts);
    }
    const dt = 100; //TODO
    while (remains.size > 0) {
      const items = await lister();
      for (const k of items) {
        remains.delete(k);
      }
      await new Promise(r => setTimeout(r, dt));
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
  get output(): TreeAny {
    const e = this.outs.entries();
    return Object.fromEntries(e);
  }
  addOutput(k: string, a: TreeAny) {
    this.outs.set(k, a);
  }
}

export { ServerChannel, ClientChannel };
