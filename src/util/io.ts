import { setSecret } from "./secret";
import { request } from "@octokit/request";
import { 
  toCommandTreeList, fromCommandTreeList
} from "../b64url/index";
import { 
  toMinutes, toBiasedDelay
} from "./toBiasedDelay";

import type { Git } from "./secret";
import type { LimitLeft } from "./toBiasedDelay";
import type { CommandTreeList } from "../b64url/index";

export type Sender = (ns: CommandTreeList) => unknown;
export type Seeker = () => Promise<SeekerOut>;
type SeekerOut = {
  ctli: CommandTreeList,
  delay: number 
}
type Headers = {
  authorization?: string
}

type SecretOut = {
  env: string,
  git: Git
}
type DispatchOut = {
  workflow: string,
  key: string,
  git: Git
}
type FileOut = {
  write: (s: string) => unknown
}
export type OptOut = (
  SecretOut | DispatchOut | FileOut
)

interface ReadGitHubHeaders {
  (h: GitHubHeaders) : LimitLeft 
}

type GitHubHeaders = {
 'x-ratelimit-reset'?: string,
 'x-ratelimit-remaining'?: string 
}
type ReleaseIn = {
  git: Git
}
type FileIn = {
  read: () => Promise<string>
}

export type OptIn = (
  ReleaseIn | FileIn
)

export function isString(s: unknown): s is string {
  return typeof s === "string";
}

function isGit(a: unknown): a is Git {
  if (!a || typeof a !== "object") return false; 
  const { owner, repo, owner_token: ot } = (a as Git);
  return [ owner, repo, ot ].every(isString);
}

function isFileOut(a: OptOut): a is FileOut {
  return typeof (a as FileOut).write === "function";
}

function isSecretOut(a: OptOut): a is SecretOut {
  const { env, git } = (a as SecretOut);
  return isString(env) && isGit(git);
}

function isDispatchOut(a: OptOut): a is DispatchOut {
  const { workflow, key, git } = (a as DispatchOut);
  return isString(workflow) && isString(key) && isGit(git);
}

function isFileIn(a: OptIn): a is FileIn {
  return typeof (a as FileIn).read === "function";
}

function isReleaseIn(a: OptIn): a is ReleaseIn {
  return isGit((a as ReleaseIn).git);
}

const toSecretSender = (opt: SecretOut) => {
  const { git, env } = opt;
  const sender: Sender = (ctl) => {
    ctl.forEach(({ command, tree }) => {
      setSecret({ command, tree, git, env });
    })
  }
  return sender;
}

const toHeaders = (git: Git, need_auth: boolean): Headers => {
  const headers: Headers = {};
  const { owner_token } = git;
  if (owner_token.length > 0) {
    headers.authorization = 'bearer ' + owner_token;
  }
  else if (need_auth) {
    throw new Error('No GitHub authentication token');
  }
  return headers;
}

const toDispatchSender = (opt: DispatchOut) => {
  const { owner, repo } = opt.git;
  const headers = toHeaders(opt.git, true);
  const { key, workflow: event_type } = opt;
  const api = "/repos/{owner}/{repo}/dispatches";
  const sender: Sender = (ctl) => {
    const text = fromCommandTreeList(ctl);
    const client_payload = { [key]: text };
    const opts = {
      event_type, client_payload, owner, repo, headers
    };
    request(`POST ${api}`, opts);
  }
  return sender;
}

const toFileSender = (opt: FileOut) => {
  const { write } = opt; 
  const sender: Sender = (ctl) => {
    write(fromCommandTreeList(ctl));
  }
  return sender;
}

const readGitHubHeaders: ReadGitHubHeaders = (headers) => {
  const when = new Date();
  const basis = Math.floor(when.getTime() / 1000);
  const count = parseInt(headers['x-ratelimit-remaining'] || '0');
  const reset = parseInt(headers['x-ratelimit-reset'] || '0');
  const minutes = toMinutes(reset) - toMinutes(basis);
  return { when, count, minutes };
}

const toReleaseSeeker = (opt: ReleaseIn) => {
  const { owner, repo } = opt.git; 
  const headers = toHeaders(opt.git, false);
  const api = `/repos/${owner}/${repo}/releases/latest`;
  const limit: LimitLeft = { 
    when: new Date(), count: 0, minutes: 0
  };
  const seeker: Seeker = async () => {
    const result = await request(`GET ${api}`, { headers });
    const newLimit = readGitHubHeaders(result.headers);
    const ctli = toCommandTreeList(result.data?.body || "");
    // Detect when the time period has reset
    if (newLimit.count >= limit.count) {
      limit.minutes = newLimit.minutes;
      limit.count = newLimit.count;
      limit.when = new Date();
    }
    // We have exceeded the allowed limit
    if (newLimit.count === 0) {
      console.warn('Exceeded release API limit');
      const sleep = newLimit.minutes * 60;
      return { ctli, delay: sleep };
    }
    const delay = toBiasedDelay(limit);
    return { ctli, delay };
  }
  return seeker;
}

const toFileSeeker = (opt: FileIn) => {
  const { read } = opt; 
  const seeker: Seeker = async () => {
    const ctli = toCommandTreeList(await read());
    return { ctli, delay: 0 };
  }
  return seeker;
}

function toSender (opt: OptOut): Sender;
function toSender (opt: OptOut | null): Sender | null;
function toSender (opt: OptOut | null): Sender | null {
  if (opt === null) return null;
  if (isSecretOut(opt)) {
    return toSecretSender(opt);
  }
  else if (isDispatchOut(opt)) {
    return toDispatchSender(opt);
  }
  else if (isFileOut(opt)) {
    return toFileSender(opt)
  }
  throw new Error('Unable to configure sender.');
}

function toSeeker (opt: OptIn): Seeker;
function toSeeker (opt: OptIn | null): Seeker | null;
function toSeeker (opt: OptIn | null): Seeker | null {
  if (opt === null) return null;
  if (isReleaseIn(opt)) {
    return toReleaseSeeker(opt);
  }
  else if (isFileIn(opt)) {
    return toFileSeeker(opt);
  }
  throw new Error('Unable to configure sender.');
}

export { toSender, toSeeker }
