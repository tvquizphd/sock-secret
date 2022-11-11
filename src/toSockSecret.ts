import { SecretChannel } from "./util/channel";

import type { TreeAny } from "./b64url/index";
import type { ChannelOptions } from "./util/channel";

type OpId = string | undefined;

export interface SocketWrapper {
  give: (o: OpId, t: string, m: TreeAny) => void;
  get: (o: OpId, t: string) => Promise<any>;
}

type SocketOptions = ChannelOptions;

interface SocketFunction {
  (s: SecretChannel): SocketWrapper;
}

const toKey = (op_id: OpId, tag: string) => {
  return `${op_id || 'noop'}__${tag}`;
}

const toSocket: SocketFunction = (channel) => ({
  get: (op_id, tag) => {
    return new Promise(function (resolve) {
      const k = toKey(op_id, tag);
      if (!channel.hasResponse(k)) {
        channel.listenForKey(k, resolve);
      } else {
        channel.receiveKey(k, resolve);
      }
    });
  },
  give: (op_id, tag, msg) => {
    const k = toKey(op_id, tag);
    channel.sendMail(k, msg);
  },
});

const toSockSecret = async (inputs: SocketOptions) => {
  return toSocket(new SecretChannel(inputs));
}

export {
  toSockSecret
}
