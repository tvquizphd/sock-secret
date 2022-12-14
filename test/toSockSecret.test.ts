import { toSockClient } from "../src/index";
import * as dotenv from "dotenv";

import type { NamedSecret } from "../src/index";

describe("Write Secrets", () => {
  dotenv.config();
  const env = process.env.GITHUB_ENV || "";
  const repo = process.env.GITHUB_REPO || "";
  const owner = process.env.GITHUB_USER || "";
  const owner_token = process.env.GITHUB_TOKEN || "";
  const needs = [env, repo, owner, owner_token];
  it("Validate Input Environment", async () => {
    const passed = needs.every(v => v);
    expect(passed).toEqual(true);
  })
  it("Create Environment Secret", async () => {
    const git = { repo, owner, owner_token };
    const sock = await toSockClient({ env, git });
    const secret = { foo: "bar" };
    sock.give(undefined, "name", secret);
    await sock.quit();
    const passed = sock != null;
    expect(passed).toEqual(true);
  })
  it("Create Local Secret", async () => {
    const git = { repo, owner, owner_token };
    let result = "";
    const sender = ({name, secret}: NamedSecret) => {  
      result = `${name} ${secret}`;
    }
    const sock = await toSockClient({ env, git, sender });
    const secret = { foo: "bar" };
    sock.give(undefined, "name", secret);
    await sock.quit();
    const passed = sock != null;
    expect(passed).toEqual(true);
    expect(result).toEqual("noop__name #foo=bar");
  })
});
