import { ServerChannel, ClientChannel } from "./util/channel";

import type { TreeAny, CommandTreeList } from "./b64url/index";
import type { ClientOpts, ServerOpts } from "./util/channel";

type OpId = string | undefined;

export interface Sock {
  give: (o: OpId, t: string, m: TreeAny) => Promise<void>;
  get: (o: OpId, t: string) => Promise<TreeAny | undefined>;
}
export interface SockClient extends Sock {
  quit: () => void;
}
export interface SockServer extends Sock {
  quit: () => CommandTreeList;
}

type ClientOptions = ClientOpts;
type ServerOptions = ServerOpts;
export interface ToSockClient {
  (i: ClientOptions): Promise<SockClient>;
}
export interface ToSockServer {
  (i: ServerOptions): Promise<SockServer>;
}

const toKey = (op_id: OpId, tag: string) => {
  return `${op_id || 'noop'}__${tag}`;
}

const toSockServer: ToSockServer = async (opts) => {
  const channel = new ServerChannel(opts);
  return {
    get: async (op_id, tag) => {
      const k = toKey(op_id, tag);
      return channel.get(k);
    },
    give: async (op_id, tag, msg) => {
      const k = toKey(op_id, tag);
      channel.addOutput(k, msg);
    },
    quit: () => {
      return channel.output;
    }
  }
}

const toSockClient: ToSockClient = async (opts) => {
  const channel = new ClientChannel(opts);
  return {
    get: async (op_id, tag) => {
      const command = toKey(op_id, tag);
      return channel.access(command);
    },
    give: async (op_id, tag, tree) => {
      const command = toKey(op_id, tag);
      const ct = { command, tree };
      await channel.sendToServer([ ct ]);
    },
    quit: () => {
      channel.finish();
    }
  }
}

export {
  toSockServer, toSockClient
}
