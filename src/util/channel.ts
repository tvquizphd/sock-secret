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
    this.dt = (opts.delay || 1) * 1000;
    this.sender = toSender(opts.output || null);
    this.seeker = toSeeker(opts.input || null);
    this.mapper = opts.mapper || noMapper;
    this.preface = opts.preface || [];
    this.done = this.seeker === null;
    this.waiters = new Map();
    this.ins = new Map();
    this.done = false;
    this.seek();
  }

  async seek() {
    while (!this.done && this.seeker !== null) {
      const {delay, ctli} = await this.seeker();
      const ctl = await this.mapper(ctli);
      ctl.forEach(({ command, tree }) => {
        this.ins.set(command, tree);
        this.choose({ command, tree });
      });
      const dt = Math.max(delay * 1000, this.dt);
      await new Promise(r => setTimeout(r, dt));
    }
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
      console.log(`Awaiting ${command}`);
      if (this.waiters.has(command)) {
        no(new Error(`Duplicate ${command} getter.`));
      }
      this.waiters.set(command, { yes, no });
    })
  }
  sendToServer(ctl: CommandTreeList) {
    if (this.sender === null) {
      throw new Error("Can't send, no output configured.");
    }
    this.sender([...this.preface, ...ctl]);
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
    if (this.has(command)) {
      const tree = this.get(command);
      console.log(`Resolving ${command}`);
      this.choose({ command, tree });
      return tree;
    }
    return this.wait(command);
  }
  finish() {
    this.done = true;
    const keys = this.waiters.keys();
    [...keys].forEach((command: string) => {
      const choice = this.waiters.get(command)
      if (choice) {
        this.waiters.delete(command);
        const msg = `Unable to resolve ${command}.`;
        return choice.no(new Error(msg));
      }
    });
  }
}

class ServerChannel {

  ins: CommandMap;
  outs: CommandMap;

  constructor(opts: ServerOpts) {
    this.ins = parseTree(opts.inputs);
    this.outs = new Map();
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
