export declare type TreeAny = {
    [k: string]: TreeAny | boolean | Uint8Array | string;
};
export declare type NodeAny = TreeAny | boolean | Uint8Array | string;
interface FromB64Q {
    (s: string): TreeAny;
}
declare const toB64urlQuery: (o: TreeAny) => string;
declare const fromB64urlQuery: FromB64Q;
export { toB64urlQuery, fromB64urlQuery };
