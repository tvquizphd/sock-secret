import type { TreeAny } from "./b64url/index";
import type { ChannelOptions } from "./util/channel";
declare type OpId = string | undefined;
export interface SocketWrapper {
    give: (o: OpId, t: string, m: TreeAny) => void;
    get: (o: OpId, t: string) => Promise<any>;
}
declare type SocketOptions = ChannelOptions;
declare const toSockSecret: (inputs: SocketOptions) => Promise<SocketWrapper>;
export { toSockSecret };
