import { toSender, toSeeker } from "./io";

import type { TreeAny, NameTree, CommandTreeList } from "../b64url/index";
import type { Seeker, Sender, Persist } from "./io";
import type { OptOut, OptIn } from "./io";

export type ClientResult = Persist;

export type ClientOpts = {
  persist?: Partial<Persist>,
  preface?: CommandTreeList,
  mapper?: Mapper,
  output?: OptOut,
  input?: OptIn,
  delay?: number
};
export type ServerOpts = {
  inputs: CommandTreeList 
}

type EFn = (a: Error) => void;
type Fn = (s: TreeAny) => void;
type Choice = { yes: Fn, no: EFn };
type CommandMap = Map<string, TreeAny>;

interface ParseTree {
  (ctl: CommandTreeList): CommandMap;
}

interface Mapper {
  (ctl: CommandTreeList): CommandTreeList;
}

const parseTree: ParseTree = (ctl) => {
  return ctl.reduce((o, {command, tree}) => {
    o.set(command, tree);
    return o;
  }, new Map() as CommandMap);
}

const noMapper: Mapper = (ctl) => ctl;
const toNewUTC = () => {
  return new Date().toUTCString();
}

const SINCE = 'last-modified' as const;
class ClientChannel {

  waiters: Map<string, Choice>;
  preface: CommandTreeList;
  sender: Sender | null;
  seeker: Seeker | null;
  persist: Persist;
  mapper: Mapper;
  done: boolean;
  dt: number;

  constructor(opts: ClientOpts) {
    this.done = false;
    this.preface = [];
    this.sender = null;
    this.seeker = null;
    this.mapper = noMapper;
    this.persist = {
      [SINCE]: toNewUTC() 
    };
    this.waiters = new Map();
    this.dt = 1000;
    this.update(opts);
    this.seek();
  }
  update(opts: Partial<ClientOpts>) {
    if (opts.persist) {
      this.persist = { ...this.persist, ...opts.persist };
    }
    if (opts.output) this.sender = toSender(opts.output);
    if (opts.input) this.seeker = toSeeker(opts.input);
    if (opts.preface) this.preface = opts.preface;
    if (opts.delay) this.dt = opts.delay * 1000;
    if (opts.mapper) this.mapper = opts.mapper;
    this.done = this.seeker === null;
  }
  async seek() {
    while (!this.done && this.seeker !== null) {
      const seeker_out = await this.trySeeker();
      const { delay, ctli } = seeker_out;
      if (SINCE in seeker_out && seeker_out[SINCE]) {
        const since = seeker_out[SINCE];
        this.persist[SINCE] = since;
      }
      const ctl = await this.tryMapper(ctli);
      ctl.forEach(({ command, tree }) => {
        this.choose({ command, tree });
      });
      const dt = Math.max(delay * 1000, this.dt);
      await new Promise(r => setTimeout(r, dt));
    }
  }
  async trySeeker () {
    try {
      if (this.seeker === null) {
        throw new Error("Can't seek, no input configured.");
      }
      return await this.seeker();
    }
    catch (e) {
      this.finish(e instanceof Error ? e.message : 'seeker');
    }
    const delay = Math.round(this.dt / 1000);
    const ctli: CommandTreeList = [];
    return { delay, ctli };
  }
  async tryMapper (ctli: CommandTreeList) {
    try {
      return await this.mapper(ctli);
    }
    catch (e) {
      this.finish(e instanceof Error ? e.message : 'mapper');
    }
    return [] as CommandTreeList;
  }
  wait(command: string) {
    return new Promise((yes: Fn, no: EFn) => {
      console.log(`Sock: seeking ${command}`);
      if (this.waiters.has(command)) {
        no(new Error(`Duplicate ${command} getter.`));
      }
      this.waiters.set(command, { yes, no });
    })
  }
  async sendToServer(ctl: CommandTreeList) {
    if (this.sender === null) {
      throw new Error("Can't send, no output configured.");
    }
    await this.sender([...this.preface, ...ctl]);
  }
  choose({ command, tree }: NameTree) {
    const choice = this.waiters.get(command);
    if (choice) {
      this.waiters.delete(command);
      return choice.yes(tree);
    }
  }
  async access(command: string): Promise<TreeAny> {
    if (this.seeker === null) {
      throw new Error("Can't access, no input configured.");
    }
    return this.wait(command);
  }
  finish(msg: string) {
    this.done = true;
    const keys = this.waiters.keys();
    [...keys].forEach((command: string) => {
      const choice = this.waiters.get(command)
      if (choice) {
        this.waiters.delete(command);
        const m = `Sock: ${command}: ${msg}.`;
        return choice.no(new Error(m));
      }
    });
    return this.persist;
  }
}

class ServerChannel {

  ins: CommandMap;
  outs: CommandMap;

  constructor(opts: ServerOpts) {
    this.outs = new Map();
    this.ins = new Map();
    this.update(opts);
  }
  update(opts: Partial<ServerOpts>) {
    if (opts.inputs) this.ins = parseTree(opts.inputs);
  }
  has(command: string): boolean {
    return this.ins.has(command);
  }
  get(command: string): TreeAny {
    const tree = this.ins.get(command);
    if (tree) return tree;
    throw new Error(`Missing ${command}`);
  }
  get output(): CommandTreeList {
    const e = [...this.outs.entries()];
    return e.map(([command, tree]) => {
      return { command, tree };
    });
  }
  addOutput(command: string, a: TreeAny) {
    this.outs.set(command, a);
  }
}

export { ServerChannel, ClientChannel };
