import { toSockSecret } from "../src/index";
import * as dotenv from "dotenv";

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
    const sock = await toSockSecret({ env, git });
    const secret = { foo: "bar" };
    sock.client.give(undefined, "name", secret);
    const passed = sock != null;
    expect(passed).toEqual(true);
  })
});
