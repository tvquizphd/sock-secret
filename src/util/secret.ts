import { toB64urlQuery } from "../b64url/index";
import { request } from "@octokit/request";
import _sodium from 'libsodium-wrappers';

import type { NameTree } from "../b64url/index";

type Sodiumized = {
  ev: string,
  key_id: string
}

interface Sodiumize {
  (t: string, i: string, e: string, v: string): Promise<Sodiumized>;
}

export type GitNoAuth = {
  repo: string,
  owner: string
}
export type Git = GitNoAuth & {
  owner_token: string
}

type SetSecretInputs = NameTree & {
  git: Git,
  env: string
}
interface ToRepoId {
  (i: Git): Promise<string>;
}
interface SetSecret {
  (i: SetSecretInputs): Promise<void>;
}

const sodiumize: Sodiumize = async (token, id, env, value) => {
  const api_root = `/repositories/${id}/environments/${env}`;
  const api_url = `${api_root}/secrets/public-key`;
  const authorization = `token ${token}`;
  const get_r = await request(`GET ${api_url}`, {
    headers: { authorization }
  })
  const { key, key_id } = get_r.data;
  await _sodium.ready;
  const seal = _sodium.crypto_box_seal;
  const b64 = _sodium.base64_variants.ORIGINAL;
  const buff_key = _sodium.from_base64(key, b64);
  const encryptedBytes = seal(value, buff_key);
  const ev = _sodium.to_base64(encryptedBytes, b64);
  return { key_id, ev };
}

const toRepoId: ToRepoId = async (git) => {
  const get_api = `/repos/${git.owner}/${git.repo}`;
  const authorization = `token ${git.owner_token}`;
  const get_r = await request(`GET ${get_api}`, {
    headers: { authorization }
  });
  return `${get_r.data.id}`;
}

const setSecret: SetSecret = async (inputs) => {
  const { command, tree, git, env } = inputs;
  const id = await toRepoId(git);
  const secret = toB64urlQuery(tree);
  const authorization = `token ${git.owner_token}`;
  const e_secret = await sodiumize(git.owner_token, id, env, secret);
  const api_root = `/repositories/${id}/environments/${env}`;
  const api_url = `${api_root}/secrets/${command}`;
  await request(`PUT ${api_url}`, {
    key_id: e_secret.key_id,
    encrypted_value: e_secret.ev,
    headers: { authorization }
  });
}

export { setSecret }
