import { toSender, toSeeker } from "./io";

import type { TreeAny, NameTree, CommandTreeList } from "../b64url/index";
import type { Seeker, Sender } from "./io";
import type { OptOut, OptIn } from "./io";

export type ClientOpts = {
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

class ClientChannel {

  waiters: Map<string, Choice>;
  preface: CommandTreeList;
  sender: Sender | null;
  seeker: Seeker | null;
  mapper: Mapper;
  done: boolean;
  dt: number;
  ins: CommandMap;

  constructor(opts: ClientOpts) {
    this.done = false;
    this.preface = [];
    this.sender = null;
    this.seeker = null;
    this.mapper = noMapper;
    this.waiters = new Map();
    this.ins = new Map();
    this.dt = 1000;
    this.update(opts);
    this.seek();
  }
  update(opts: Partial<ClientOpts>) {
    if (opts.output) this.sender = toSender(opts.output);
    if (opts.input) this.seeker = toSeeker(opts.input);
    if (opts.preface) this.preface = opts.preface;
    if (opts.delay) this.dt = opts.delay * 1000;
    if (opts.mapper) this.mapper = opts.mapper;
    this.done = this.seeker === null;
  }
  async seek() {
    while (!this.done && this.seeker !== null) {
      const {delay, ctli} = await this.trySeeker();
      const ctl = await this.tryMapper(ctli);
      ctl.forEach(({ command, tree }) => {
        this.ins.set(command, tree);
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
  has(command: string): boolean {
    return this.ins.has(command);
  }
  get(command: string): TreeAny {
    const tree = this.ins.get(command);
    if (tree) return tree;
    throw new Error(`Missing ${command}`);
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
      this.ins.delete(command);
      return choice.yes(tree);
    }
  }
  async access(command: string): Promise<TreeAny> {
    if (this.seeker === null) {
      throw new Error("Can't access, no input configured.");
    }
    if (this.has(command)) {
      const tree = this.get(command);
      console.log(`Sock: found ${command}`);
      this.choose({ command, tree });
      return tree;
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
