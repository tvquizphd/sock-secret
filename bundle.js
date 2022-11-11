import { graphql } from '@octokit/graphql';

const isBytes = (o) => {
    return ArrayBuffer.isView(o);
};
const isObj = (o) => {
    return typeof o === "object";
};
const chars = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789-_'
].join('');
const lookup = ((str) => {
    const out = new Uint8Array(256);
    for (let i = 0; i < str.length; i++) {
        out[str.charCodeAt(i)] = i;
    }
    return out;
})(chars);
const toB64url = (bytes) => {
    const len = bytes.length;
    let str = '';
    for (let i = 0; i < len; i += 3) {
        str += chars[bytes[i] >> 2];
        str += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
        str += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
        str += chars[bytes[i + 2] & 63];
    }
    if (len % 3 === 2) {
        str = str.substring(0, str.length - 1) + '=';
    }
    else if (len % 3 === 1) {
        str = str.substring(0, str.length - 2) + '==';
    }
    return str;
};
const fromB64url = (str) => {
    const len = str.length;
    let bufferLength = str.length * 0.75;
    if (str[str.length - 1] === '=') {
        bufferLength--;
        if (str[str.length - 2] === '=') {
            bufferLength--;
        }
    }
    const arraybuffer = new ArrayBuffer(bufferLength);
    const bytes = new Uint8Array(arraybuffer);
    let p = 0;
    for (let i = 0; i < len; i += 4) {
        const encoded1 = lookup[str.charCodeAt(i)];
        const encoded2 = lookup[str.charCodeAt(i + 1)];
        const encoded3 = lookup[str.charCodeAt(i + 2)];
        const encoded4 = lookup[str.charCodeAt(i + 3)];
        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    return bytes;
};
const toB64val = (v) => {
    if (isBytes(v)) {
        return ":" + toB64url(v);
    }
    else if (isObj(v)) {
        return toB64urlObj(v);
    }
    return `${v}`;
};
const toB64urlObj = (o) => {
    const entries = Object.entries(o);
    return entries.reduce((out, [k, v]) => {
        return { ...out, [k]: toB64val(v) };
    }, {});
};
const fromB64val = (v) => {
    if (typeof v === "string" && v[0] === ":") {
        const val = v.slice(1);
        if (!val.match(/[^0-9a-zA-Z=_-]/)) {
            return fromB64url(val);
        }
    }
    if (isObj(v)) {
        return fromB64urlObj(v);
    }
    if (v == "true") {
        return true;
    }
    if (v == "false") {
        return false;
    }
    return v;
};
const nester = (params) => {
    const keyLists = Object.keys(params).map(k => {
        const l = k.split('__');
        return { k, l, len: l.length };
    });
    const keys = keyLists.sort((a, b) => a.len - b.len);
    return keys.reduce((o, { k, l, len }) => {
        let node = o;
        for (let i = 0; i < len - 1; i++) {
            if (!(l[i] in node)) {
                node[l[i]] = {};
            }
            node = node[l[i]];
        }
        const last = l.slice(-1)[0];
        node[last] = params[k];
        return o;
    }, {});
};
const fromB64urlObj = (o) => {
    const entries = Object.entries(o);
    return entries.reduce((out, [k, v]) => {
        return { ...out, [k]: fromB64val(v) };
    }, {});
};
const _toB64urlQuery = (o, pre = []) => {
    const entries = Object.entries(toB64urlObj(o));
    return entries.reduce((out, [k, v]) => {
        const keys = [...pre, k];
        const key = keys.join('__');
        if (isObj(v)) {
            const value = _toB64urlQuery(v, keys);
            return `${out}${value}`;
        }
        return `${out}&${key}=${v}`;
    }, '');
};
const toB64urlQuery = (o) => {
    return _toB64urlQuery(o).replace('&', '?');
};
const fromB64urlQuery = (search) => {
    const searchParams = new URLSearchParams(search);
    const params = Object.fromEntries(searchParams.entries());
    return fromB64urlObj(nester(params));
};

const serialize = (data) => {
    return toB64urlQuery({ data });
};
const deserialize = (str) => {
    return fromB64urlQuery(str).data;
};
class ProjectChannel {
    constructor(inputs) {
        const { project, scope } = inputs;
        this.project = project;
        this.scope = scope;
    }
    hasResponse(k) {
        return this.project.hasResponse(k);
    }
    toKey(op_id, tag) {
        const names = [this.scope, op_id, tag];
        return names.join('__');
    }
    listenForKey(k, res) {
        const resolve = (s) => res(deserialize(s));
        this.project.awaitItem([k, resolve]);
    }
    receiveMailKey(k, res) {
        const resolve = (s) => res(deserialize(s));
        this.project.resolver([k, resolve]);
    }
    sendMail(k, a) {
        this.project.addItem(k, serialize(a));
    }
}

const needKeys = (obj, keys) => {
    const obj_keys = Object.keys(obj).join(' ');
    for (const key of keys) {
        if ('error' in obj) {
            throw new Error(obj.error);
        }
        if (!(key in obj)) {
            throw new Error(`${key} not in [${obj_keys}]`);
        }
    }
};

const addItem = async (inputs) => {
    const { octograph, title, body, id } = inputs;
    const add_in = { p: id, t: title, b: body };
    const n = (await octograph(`
    mutation($p: ID!, $t: String!, $b: String!) {
      addProjectV2DraftIssue(input: {projectId: $p, title: $t, body: $b}) {
        projectItem {
          id,
          content {
            ... on DraftIssue {
              title,
              body,
              id
            }
          }
        }
      }
    }
  `, add_in));
    return {
        ...n.content,
        id: n.id
    };
};
const removeItem = async (inputs) => {
    const { octograph, itemId, id } = inputs;
    const delete_in = { p: id, i: itemId };
    const n = (await octograph(`
  mutation($p: ID!, $i: ID!) {
    deleteProjectV2Item( input: {projectId: $p, itemId: $i} ) {
      deletedItemId
    }
  }`, delete_in));
    return {
        id: n.deletedItemId
    };
};
const fetchItems = async (inputs) => {
    const { octograph } = inputs;
    const { nodes } = (await octograph(`
    query($owner: String!, $number: Int!) {
      user(login: $owner){
        projectV2(number: $number) {
          items(first: 100) {
            nodes {
              id,
              content {
                ... on DraftIssue {
                  title,
                  body
                }
              }
            }
          }
        }
      }
    }
  `, inputs)).user.projectV2.items;
    return nodes.map((n) => {
        return {
            ...n.content,
            id: n.id
        };
    });
};
const seekItems = (inputs) => {
    const { interval } = inputs;
    const dt = 1000 * interval;
    return new Promise((resolve) => {
        setTimeout(async () => {
            const result = await fetchItems(inputs);
            resolve(result);
        }, dt);
    });
};
class Project {
    constructor(inputs) {
        const { id, number, owner, octograph, title } = inputs;
        this.commands = inputs.commands || [];
        this.max_time = inputs.limit || 15 * 60;
        this.interval = inputs.delay || 1;
        this.id = id;
        this.title = title;
        this.owner = owner;
        this.number = number;
        this.octograph = octograph;
        this.waitMap = new Map();
        this.call_fifo = [];
        this.done = false;
        this.items = [];
        this.mainLoop();
    }
    get itemObject() {
        return this.items.reduce((o, i) => {
            return { ...o, [i.title]: i };
        }, {});
    }
    get commandObject() {
        return this.commands.reduce((o, c) => {
            return { ...o, [c.text]: c };
        }, {});
    }
    get hasCommands() {
        return this.commands.length > 0;
    }
    hasResponse(k) {
        return k in this.itemObject;
    }
    async mainLoop() {
        const inputs = {
            owner: this.owner,
            number: this.number,
            interval: this.interval,
            octograph: this.octograph
        };
        while (!this.done) {
            // Add or remove
            if (this.call_fifo.length > 0) {
                const queued = this.call_fifo.shift();
                await queued();
            }
            // Receive
            else {
                const items = await seekItems(inputs);
                this.setItems({ items });
            }
        }
    }
    setItems({ items }) {
        if (this.hasCommands) {
            const { commandObject } = this;
            this.items = items.filter((item) => {
                return item.title in commandObject;
            });
        }
        else {
            this.items = items;
        }
        // Resolve all awaited messages
        const resolver = this.resolver.bind(this);
        [...this.waitMap].forEach(resolver);
    }
    resolver([k, resolve]) {
        const itemObject = this.itemObject;
        if (k in itemObject) {
            const { body } = itemObject[k];
            console.log(`Resolving ${k}`);
            if (this.waitMap.has(k)) {
                this.waitMap.delete(k);
            }
            const commands = [{ text: k }];
            const clearArgs = { commands };
            const finish = () => resolve(body);
            this.clear(clearArgs).then(finish);
        }
    }
    addItem(k, v) {
        const { octograph, id } = this;
        const inputs = {
            octograph,
            title: k,
            body: v,
            id
        };
        this.call_fifo.push(async () => {
            await addItem(inputs);
        });
    }
    awaitItem([k, resolve]) {
        console.log(`Awaiting ${k}`);
        if (this.waitMap.has(k)) {
            throw new Error(`Repeated ${k} handler`);
        }
        this.waitMap.set(k, resolve);
    }
    clearItems(items, clearArgs) {
        const { octograph, id } = this;
        const done = clearArgs?.done || false;
        const cmds = clearArgs?.commands || [];
        const cleared = items.filter(({ title }) => {
            const ok = cmds.some(({ text }) => text === title);
            return (cmds.length === 0) ? true : ok;
        });
        const fns = cleared.map(async ({ id: itemId }) => {
            const inputs = { octograph, id, itemId };
            try {
                await removeItem(inputs);
            }
            catch {
                return;
            }
        });
        return new Promise(resolve => {
            this.call_fifo.push(async () => {
                await Promise.all(fns);
                this.done = done;
                resolve();
            });
        });
    }
    async clear(clearArgs) {
        return await this.clearItems(this.items, clearArgs);
    }
    finish() {
        return this.clear({ done: true });
    }
}

function isLoaded(x) {
    const details = "shortDescription";
    const need_keys = [details, "number", "id"];
    try {
        needKeys(x || {}, need_keys);
        return true;
    }
    catch {
        return false;
    }
}
const findProject = async (inputs) => {
    const { octograph } = inputs;
    const { projectsV2 } = (await octograph(`
    query($title: String!, $owner: String!) {
      user(login: $owner) {
        projectsV2(first: 100, query: $title) {
          nodes {
            shortDescription,
            number,
            id
          }
        }
      }
    }
  `, inputs)).user;
    const { repoId } = inputs;
    const nodes = projectsV2.nodes.filter((node) => {
        const details = node.shortDescription;
        return !repoId || repoId === details;
    });
    if (nodes.length) {
        return nodes[0];
    }
    return null;
};
const createProject = async (inputs) => {
    const { octograph, ownerId, title } = inputs;
    const create_in = { o: ownerId, t: title };
    const { projectV2 } = (await octograph(`
    mutation($o: ID!, $t: String!) {
      createProjectV2(input: {ownerId: $o, title: $t}) {
        projectV2 {
          shortDescription,
          number,
          id
        }
      }
    }
  `, create_in)).createProjectV2;
    if (!inputs.repoId) {
        return projectV2;
    }
    const update_in = { p: projectV2.id, r: inputs.repoId };
    const { updateProjectV2 } = await octograph(`
    mutation($p: ID!, $r: String!) {
      updateProjectV2(input: {projectId: $p, shortDescription: $r}) {
        projectV2 {
          shortDescription,
          number,
          id
        }
      }
    }
  `, update_in);
    return updateProjectV2.projectV2;
};
const loadProject = async (inputs) => {
    const { title } = inputs;
    const node = await findProject(inputs);
    if (isLoaded(node)) {
        console.log(`Found Project '${title}'`);
        return node;
    }
    console.log(`Creating Project '${title}'`);
    return await createProject(inputs);
};
const seeOwnerIds = async (inputs) => {
    const { octograph } = inputs;
    const isRepo = !!inputs.repo;
    if (isRepo) {
        const { user } = (await octograph(`
      query($repo: String!, $owner: String!) {
        user(login: $owner) {
          repository(name: $repo) {
            id
          },
          id
        }
      }
    `, inputs));
        const ownerId = user.id;
        const repoId = user.repository.id;
        return { ownerId, repoId };
    }
    const ownerId = (await octograph(`
    query($owner: String!) {
      user(login: $owner) {
        id
      }
    }
  `, inputs)).user.id;
    const repoId = null;
    return { repoId, ownerId };
};
const toProject = (inputs) => {
    const { token, owner, title, repo } = inputs;
    const { commands, limit, delay } = inputs;
    const octograph = graphql.defaults({
        headers: {
            authorization: `token ${token}`,
        }
    });
    const inputs_1 = { owner, repo, octograph };
    const promise_ids = seeOwnerIds(inputs_1);
    return promise_ids.then(({ repoId, ownerId }) => {
        const inputs_2 = {
            owner, repo, repoId, ownerId, octograph, title
        };
        const promise_project = loadProject(inputs_2);
        return promise_project.then(({ id, number }) => {
            console.log(`Loaded Project '${title}'`);
            const inputs_3 = {
                ...inputs_2,
                limit,
                delay,
                commands,
                number,
                id
            };
            return new Project(inputs_3);
        }).catch((e) => {
            console.error(`Unable to load project.`);
            console.error(e?.message);
        });
    }).catch((e) => {
        console.error(`Unable to see owner "${owner}"`);
        console.error(e?.message);
    });
};

const socket = (sock) => ({
    sock,
    get: (op_id, tag) => {
        return new Promise(function (resolve) {
            const k = sock.toKey(op_id, tag);
            if (!sock.hasResponse(k)) {
                sock.listenForKey(k, resolve);
            }
            else {
                sock.receiveMailKey(k, resolve);
            }
        });
    },
    give: (op_id, tag, msg) => {
        const k = sock.toKey(op_id, tag);
        sock.sendMail(k, msg);
    },
});
const toProjectSock = async (inputs) => {
    const { scope } = inputs;
    const project = await toProject(inputs);
    if (!project) {
        throw new Error("Unable to find project");
    }
    const inputs_1 = { scope, project };
    return socket(new ProjectChannel(inputs_1));
};

const FIELDS = `
            id,
            state,
            task,
            payload,
            environment`;
const toAddMeta = (inputs) => {
    const base_env = "development";
    const base_meta = { env: base_env };
    const has_meta = (inputs.metadata || {});
    const metadata = { ...base_meta, ...has_meta };
    function plusMeta(n) {
        return { ...n, metadata };
    }
    return plusMeta;
};
function isDeployment(n) {
    return "state" in n && "environment" in n;
}
const isEnv = (node) => {
    const { env } = node.metadata;
    const is_env = env === node.environment;
    return isDeployment(node) && is_env;
};
const isPending = (node) => {
    const is_pending = 'PENDING' === node.state;
    return isEnv(node) && is_pending;
};
const isActive = (node) => {
    const is_active = 'IN_PROGRESS' === node.state;
    return isEnv(node) && is_active;
};
const toDeployments = async (inputs) => {
    const { octograph } = inputs;
    const plusMeta = toAddMeta(inputs);
    const { repository } = (await octograph(`
    query($repo: String!, $owner: String!) {
      repository( name: $repo, owner: $owner ) {
        id,
        defaultBranchRef {
          id,
          name
        },
        deployments( last: 100 ) {
          nodes {${FIELDS}
          }
        }
      }
    }
  `, inputs));
    const { id, defaultBranchRef, deployments } = repository;
    const nodes = deployments.nodes.map(plusMeta).filter(isEnv);
    const { name: refName } = defaultBranchRef;
    const { id: refId } = defaultBranchRef;
    return { nodes, refId, refName, id };
};
const undeploy = async (inputs) => {
    const success = false;
    const plusMeta = toAddMeta(inputs);
    const { nodes, ...has_ref } = await toDeployments(inputs);
    const output = plusMeta({ ...has_ref, success });
    const { octograph } = inputs;
    const promises = nodes.map(node => {
        return octograph(`
      mutation($id: ID!) {
        deleteDeployment( input: { id: $id } ) {
          clientMutationId
        }
      }
    `, node);
    });
    await Promise.all(promises);
    output.success = !!nodes.length;
    return output;
};
const toActive = async (octograph, created) => {
    const has_state = { ...created, state: 'IN_PROGRESS' };
    const start_input = [
        "deploymentId: $id",
        "state: $state",
    ].join(", ");
    const { deployment } = (await octograph(`
    mutation($id: ID!, $state: DeploymentStatusState!) {
      createDeploymentStatus( input: { ${start_input} } ) {
        deploymentStatus {
          deployment {${FIELDS}
          }
        }
      }
    }
  `, has_state)).createDeploymentStatus.deploymentStatus;
    const metadata = created.metadata;
    return { metadata, ...deployment };
};
const deploy = async (inputs) => {
    const success = false;
    const { octograph } = inputs;
    const plusMeta = toAddMeta(inputs);
    const has_ref = await undeploy(inputs);
    const output = plusMeta({ ...has_ref, success });
    const { metadata } = output;
    const create_input = [
        "requiredContexts: []",
        "environment: $env",
        "repositoryId: $id",
        "refId: $refId"
    ].join(", ");
    const has_env = { ...has_ref, ...metadata };
    const created = plusMeta((await octograph(`
    mutation($env: String!, $id: ID!, $refId: ID!) {
      createDeployment( input: { ${create_input} } ) {
        deployment {${FIELDS}
        }
      }
    }
  `, has_env)).createDeployment.deployment);
    if (!isDeployment(created)) {
        return output;
    }
    if (!isPending(created)) {
        return output;
    }
    const activated = await toActive(octograph, created);
    if (!isActive(activated)) {
        return output;
    }
    output.success = true;
    return output;
};

const toT = (args) => {
    return args.map(obj => {
        if (typeof obj == "string") {
            return { key: obj, list: [] };
        }
        const entries = Object.entries(obj);
        const [key, list] = entries.pop() || [];
        if (typeof key !== 'string') {
            const msg = `Invalid object: no entries`;
            throw new Error(msg);
        }
        if (entries.length !== 0) {
            const error = `${entries.length} extra entries`;
            const msg = `Invalid ${key}: ${error}`;
            throw new Error(msg);
        }
        if (!Array.isArray(list)) {
            const error = `${typeof list} value`;
            const msg = `Invalid ${key}: ${error}`;
            throw new Error(msg);
        }
        return { key, list };
    });
};
const compare = (o1, o2) => {
    const keys = Object.keys(o1);
    return keys.every(k => o1[k] === o2[k]);
};
const unique = (ops, key) => {
    return ops.reduce((list, op) => {
        const exists = list.some((val) => {
            return compare(op[key], val);
        });
        return exists ? list : [...list, op[key]];
    }, []);
};
const unpack = (v) => {
    const n0 = v.project.prefix;
    const { sep, operations } = v;
    return toT(operations).reduce((l1, o1) => {
        const n1 = o1.key;
        return toT(o1.list).reduce((l2, o2) => {
            const n2 = o2.key;
            return toT(o2.list).reduce((l3, o3) => {
                const n3 = o3.key;
                const parts = [
                    n0, sep, n1, "", n2, sep, n3
                ];
                const command = {
                    text: parts.join(''),
                    prefix: parts.slice(0, 3).join(''),
                    suffix: parts.slice(3).join(''),
                    subcommand: n3,
                    command: n2
                };
                const socket = {
                    text: parts.slice(0, 3).join(''),
                    prefix: n0,
                    suffix: n1
                };
                const details = {
                    command, socket
                };
                return [...l3, details];
            }, l2);
        }, l1);
    }, []);
};
const toNamespace = (names) => {
    return Object.entries(names).reduce((o, [k, v]) => {
        const { project } = v;
        const ops = unpack(v);
        const sockets = unique(ops, "socket");
        const commands = unique(ops, "command");
        const namespace = { commands, sockets, project };
        return { ...o, [k]: namespace };
    }, {});
};

export { Project, ProjectChannel, deploy, findProject, fromB64urlQuery, isActive, seeOwnerIds, toB64urlQuery, toDeployments, toNamespace, toProject, toProjectSock, undeploy };
