import { request } from "@octokit/request";
import _sodium from 'libsodium-wrappers';

type Sodiumized = {
  ev: string,
  key_id: string
}

interface Sodiumize {
  (t: string, i: string, e: string, v: string): Promise<Sodiumized>;
}

type SecretInputs = {
  env: string,
  name: string,
  secret: string
}
interface SetSecret {
  (i: SecretInputs): Promise<void>;
}

const sodiumize: Sodiumize = async (token, id, env, value) => {
  const api_root = `/repositories/${id}/environments/${env}`;
  const api_url = `${api_root}/secrets/public-key`;
  const authorization = `token ${token}`;
  const get_r = await request(`GET ${api_url}`, {
    headers: { authorization }
  })
  const { key, key_id } = get_r.data;
  const buff_key = Buffer.from(key, 'base64');
  const buff_in = Buffer.from(value);
  await _sodium.ready;
  const seal = _sodium.crypto_box_seal;
  const encryptedBytes = seal(buff_in, buff_key);
  const buff_out = Buffer.from(encryptedBytes);
  const ev = buff_out.toString('base64');
  return { key_id, ev };
}

const setSecret: SetSecret = async (inputs) => {
  const { name, env, secret } = inputs;
  const git = {
    owner: "tvquizphd",
    repo: "public-quiz-device",
    owner_token: process.argv[2] || ""
  };
  const get_api = `/repos/${git.owner}/${git.repo}`;
  const authorization = `token ${git.owner_token}`;
  const get_r = await request(`GET ${get_api}`, {
    headers: { authorization }
  });
  const id = `${get_r.data.id}`;
  const e_secret = await sodiumize(git.owner_token, id, env, secret);
  const api_root = `/repositories/${id}/environments/${env}`;
  const api_url = `${api_root}/secrets/${name}`;
  await request(`PUT ${api_url}`, {
    repo: git.repo,
    owner: git.owner,
    key_id: e_secret.key_id,
    encrypted_value: e_secret.ev,
    headers: { authorization }
  });
}

export { setSecret }
