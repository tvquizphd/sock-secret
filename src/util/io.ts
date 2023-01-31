import { setSecret } from "./secret";
import { request } from "@octokit/request";
import { RequestError } from "@octokit/request-error";
import { 
  toCommandTreeList, fromCommandTreeList
} from "../b64url/index";
import { 
  toMinutes, toBiasedDelay
} from "./toBiasedDelay";

import type { Git } from "./secret";
import type { LimitLeft } from "./toBiasedDelay";
import type { CommandTreeList } from "../b64url/index";
import type { OctokitResponse } from "@octokit/types";

export type Sender = (ns: CommandTreeList) => unknown;
export type Seeker = () => Promise<SeekerOut>;
type SeekerOut = {
  ctli: CommandTreeList,
  delay: number 
}
type Headers = {
  authorization?: string,
  "If-None-Match"?: string
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

type RequestOpts = {
  headers: Headers,
  git: Git
}
type HasBody = {
  body: string
}
type HasBodies = HasBody[];
type Data = HasBody | HasBodies;
interface RequestInterface<D> {
  (o: RequestOpts): Promise<OctokitResponse<D>>
}
type HandleRequestOpts = {
  cache: CommandCache,
  limit: LimitLeft,
  status: number,
  lines: string[]
}
interface HandleRequest {
  (o: HandleRequestOpts): SeekerOut;
}
interface ReadGitHubHeaders {
  (h: GitHubHeaders) : GitHubLimit;
}
type CommandCache = LimitLeft & {
  ctli: CommandTreeList
}
type GitHubLimit = LimitLeft & {
  etag?: string
}

type GitHubHeaders = {
 'etag'?: string,
 'x-ratelimit-reset'?: string,
 'x-ratelimit-remaining'?: string 
}
type ReleaseIn = {
  git: Git
}
type IssuesIn = {
  issues: number,
  git: Git
}
type FileIn = {
  read: () => Promise<string>
}

export type OptIn = (
  ReleaseIn | IssuesIn | FileIn
)

export function isString(s: unknown): s is string {
  return typeof s === "string";
}

function isResponse(a: unknown): a is OctokitResponse<unknown> {
  if (!a || typeof a !== "object") return false; 
  const r = (a as OctokitResponse<unknown>);
  return "url" in r && "headers" in r;
}

function isRequestError(e: unknown): e is RequestError {
  return (e instanceof RequestError);
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

function isIssuesIn(a: OptIn): a is IssuesIn {
  const { git, issues } = a as IssuesIn;
  if (typeof issues === "number") {
    return isGit(git);
  }
  return false;
}

function handleError(e: unknown, d: HasBodies): OctokitResponse<HasBodies>;
function handleError(e: unknown, d: HasBody): OctokitResponse<HasBody>;
function handleError(e: unknown, d: Data): OctokitResponse<Data> {
  if (isRequestError(e) && isResponse(e.response)) {
    const { status, response } = e;
    const { url, headers } = response;
    return { url, status, headers, data: d };
  }
  else if (isRequestError(e)) {
    const { status } = e;
    const headers: Headers = {};
    return { url: "", status, headers, data: d };
  }
  throw e;
}

const requestIssues: RequestInterface<HasBodies> = async ({ git, headers }) => {
  const api = `/repos/${git.owner}/${git.repo}/issues`;
  const creator = git.owner;
  const state = "open";
  try {
    return await request(`GET ${api}`, { 
      headers, creator, state
    });
  }
  catch (e: unknown) {
    return handleError(e, [] as HasBodies);
  }
}

const requestRelease: RequestInterface<HasBody> = async ({ git, headers }) => {
  const api = `/repos/${git.owner}/${git.repo}/releases/latest`;
  try {
    return await request(`GET ${api}`, { headers });
  }
  catch (e: unknown) {
    return handleError(e, { body: "" } as HasBody);
  }
}

const toSecretSender = (opt: SecretOut) => {
  const { git, env } = opt;
  const sender: Sender = (ctli) => {
    ctli.forEach(({ command, tree }) => {
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
  const sender: Sender = (ctli) => {
    const text = fromCommandTreeList(ctli);
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
  const sender: Sender = (ctli) => {
    write(fromCommandTreeList(ctli));
  }
  return sender;
}

const readGitHubHeaders: ReadGitHubHeaders = (headers) => {
  const when = new Date();
  const basis = Math.floor(when.getTime() / 1000);
  const reset = parseInt(headers['x-ratelimit-reset'] || '0');
  const count = parseInt(headers['x-ratelimit-remaining'] || '0');
  const minutes = Math.max(toMinutes(reset) - toMinutes(basis), 0);
  const out : GitHubLimit = { when, count, minutes };
  if ("etag" in headers) out.etag = headers.etag;
  return out;
}

const handleRequest: HandleRequest = (opts) => {
  const { cache, limit, status, lines } = opts;
  if (status === 200) {
    cache.ctli = lines.reduce((ctli, line) => {
      return ctli.concat(toCommandTreeList(line));
    }, [] as CommandTreeList);
  }
  else {
    if (status === 403 && limit.count === 0) {
      const { minutes: m } = limit
      console.warn(`Fetch forbidden for ${m} min.`);
      return { ctli: cache.ctli, delay: m * 60 };
    }
    else if (status === 304 || status === 500) {
      // Existing cache is still valid
      const delay = toBiasedDelay(cache);
      return { ctli: cache.ctli, delay };
    }
    const e = `HTTP Error ${status} in seeker`;
    throw new Error(e);
  }
  const new_count = limit.count > cache.count;
  const new_reset = limit.minutes > cache.minutes;
  // Detect when the time period has reset
  if (new_count || new_reset) {
    cache.minutes = limit.minutes;
    cache.count = limit.count;
    cache.when = new Date();
  }
  const delay = toBiasedDelay(cache);
  return { ctli: cache.ctli, delay };
}

const toNewCache = (): CommandCache => {
  return {
    ctli: [], when: new Date(), count: 0, minutes: 0
  };
}

const toReleaseSeeker = (opt: ReleaseIn) => {
  const { git } = opt;
  const cache = toNewCache();
  const no = "If-None-Match";
  const headers = toHeaders(git, false);
  const seeker: Seeker = async () => {
    const result = await requestRelease({ git, headers });
    const limit = readGitHubHeaders(result.headers);
    if ('etag' in limit) headers[no] = limit.etag;
    else delete headers[no];
    const { status, data } = result;
    const lines = [ data.body || "" ];
    return handleRequest({ cache, limit, status, lines });
  }
  return seeker;
}

const toIssuesSeeker = (opt: IssuesIn) => {
  const { git, issues } = opt;
  const cache = toNewCache();
  const no = "If-None-Match";
  const headers = toHeaders(git, false);
  const seeker: Seeker = async () => {
    const result = await requestIssues({ git, headers });
    const limit = readGitHubHeaders(result.headers);
    if ('etag' in limit) headers[no] = limit.etag;
    else delete headers[no];
    const { status, data } = result;
    const lines = data.reduce((o, d, i) => {
      if (i >= issues) return o;
    return o.concat([ d.body || "" ]);
    }, [] as string[]);
    return handleRequest({ cache, limit, status, lines });
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
  if (isIssuesIn(opt)) {
    return toIssuesSeeker(opt);
  }
  else if (isReleaseIn(opt)) {
    return toReleaseSeeker(opt);
  }
  else if (isFileIn(opt)) {
    return toFileSeeker(opt);
  }
  throw new Error('Unable to configure sender.');
}

export { toSender, toSeeker }
