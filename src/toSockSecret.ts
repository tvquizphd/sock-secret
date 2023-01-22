import { ServerChannel, ClientChannel } from "./util/channel";

import type { TreeAny } from "./b64url/index";
import type { ClientOpts, ServerOpts } from "./util/channel";

type OpId = string | undefined;

export interface Sock {
  give: (o: OpId, t: string, m: TreeAny) => void;
  get: (o: OpId, t: string) => Promise<TreeAny | undefined>;
}
export interface SockClient extends Sock {
  quit: () => Promise<void>;
}
export interface SockServer extends Sock {
  quit: (used: string[]) => Promise<TreeAny>;
}

type Need = "first" | "last";
type ClientOptions = ClientOpts;
type ServerOptions = ServerOpts & {
  needs?: Partial<Record<Need, string[]>>
};
export interface ToSockClient {
  (i: ClientOptions): Promise<SockClient>;
}
export interface ToSockServer {
  (i: ServerOptions): Promise<SockServer | null>;
}

const toKey = (op_id: OpId, tag: string) => {
  return `${op_id || 'noop'}__${tag}`;
}

const toSockServer: ToSockServer = async (inputs) => {
  const none: string[] = [];
  const { needs, ...opts } = inputs;
  const ends = needs?.last || none;
  const first = needs?.first || none;
  const channel = new ServerChannel(opts);
  if (!first.every(k => channel.has(k))) return null;
  return {
    get: async (op_id, tag) => {
      const k = toKey(op_id, tag);
      return channel.get(k);
    },
    give: (op_id, tag, msg) => {
      const k = toKey(op_id, tag);
      channel.addOutput(k, msg);
    },
    quit: async (used) => {
      await channel.find(ends);
      if (used) {
        await channel.forget(used);
      }
      return channel.output;
    }
  }
}

const toSockClient: ToSockClient = async (inputs) => {
  const channel = new ClientChannel(inputs);
  return {
    get: async (op_id, tag) => {
      const k = toKey(op_id, tag);
      return channel.access(k);
    },
    give: (op_id, tag, msg) => {
      const k = toKey(op_id, tag);
      channel.sendToServer(k, msg);
    },
    quit: async () => {
      channel.finish();
    }
  }
}

export {
  toSockServer, toSockClient
}
