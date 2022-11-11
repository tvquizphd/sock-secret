export declare type Git = {
    repo: string;
    owner: string;
    owner_token: string;
};
declare type SecretInputs = {
    git: Git;
    env: string;
    name: string;
    secret: string;
};
interface SetSecret {
    (i: SecretInputs): Promise<void>;
}
declare const setSecret: SetSecret;
export { setSecret };
