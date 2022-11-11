import { SecretChannel } from "./util/channel";

import type { TreeAny } from "./b64url/index";
import type { ChannelOptions } from "./util/channel";

type OpId = string | undefined;

export interface ClientSocket {
  give: (o: OpId, t: string, m: TreeAny) => void;
  get: (o: OpId, t: string) => Promise<TreeAny | undefined>;
}

export interface ServerSocket {
  give: (o: OpId, t: string, m: TreeAny) => Promise<void>;
  get: (o: OpId, t: string) => TreeAny | undefined;
}

export interface SocketWrapper {
  client: ClientSocket;
  server: ServerSocket;
}

interface SocketFunction {
  (s: SecretChannel): SocketWrapper;
}
type SocketOptions = ChannelOptions;

const toKey = (op_id: OpId, tag: string) => {
  return `${op_id || 'noop'}__${tag}`;
}

const toSocket: SocketFunction = (channel) => ({
  client: {
    get: async (op_id, tag) => {
      const k = toKey(op_id, tag);
      if (channel.hasResponse(k)) {
        return channel.access(k);
      }
      return await channel.waiter(k);
    },
    give: (op_id, tag, msg) => {
      const k = toKey(op_id, tag);
      channel.sendToServer(k, msg);
    }
  },
  server: {
    get: (op_id, tag) => {
      const k = toKey(op_id, tag);
      if (channel.hasResponse(k)) {
        return channel.access(k)
      }
      throw new Error(`Missing ${k}`);
    },
    give: async (op_id, tag, msg) => {
      const k = toKey(op_id, tag);
      await channel.sendToClient(k, msg);
    }
  }
});

const toSockSecret = async (inputs: SocketOptions) => {
  return toSocket(new SecretChannel(inputs));
}

export {
  toSockSecret
}
