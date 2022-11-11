import type { TreeAny } from "../b64url/index";
import type { Git } from "../util/secret";
export declare type ChannelOptions = {
    env: string;
    git: Git;
};
declare type ItemObject = Record<string, Item>;
declare type Item = {
    k: string;
    v: string;
};
declare type Resolve = (s: string) => void;
declare type Fn = (a: TreeAny) => void;
declare class SecretChannel {
    waitMap: Map<string, Resolve>;
    items: Item[];
    env: string;
    git: Git;
    constructor(opts: ChannelOptions);
    get itemObject(): ItemObject;
    hasResponse(k: string): boolean;
    listenForKey(k: string, res: Fn): void;
    receiveKey(k: string, res: Fn): void;
    sendMail(name: string, a: TreeAny): void;
    awaitItem(k: string, resolve: Resolve): void;
    resolver(k: string, resolve: Resolve): void;
}
export { SecretChannel };
