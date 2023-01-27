import { toSockClient } from "../src/index";
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
    const output = { env, git };
    const sock_in = { output, delay: 1 };
    const sock = await toSockClient(sock_in);
    const secret = { foo: "bar" };
    sock.give(undefined, "name", secret);
    sock.quit();
    const passed = sock != null;
    expect(passed).toEqual(true);
  })
  it("Create Local Secret", async () => {
    let result = "";
    const write = (text: string) => {  
      result = text;
    }
    const delay = 1;
    const output = { write };
    const sock_in = { output, delay };
    const sock = await toSockClient(sock_in);
    const secret = { foo: "bar" };
    sock.give(undefined, "name", secret);
    sock.quit();
    const passed = sock != null;
    expect(passed).toEqual(true);
    expect(result).toEqual("noop__name#foo=bar");
  })
});
