import { strict as assert } from 'node:assert';
import { toSockSecret } from "../src/index";
import * as dotenv from "dotenv";

describe("Write Secrets", () => {
  dotenv.config();
  const env = process.env.GITHUB_ENV || "";
  const repo = process.env.GITHUB_REPO || "";
  const owner = process.env.GITHUB_USER || "";
  const token = process.env.GITHUB_TOKEN || "";
  const core_inputs = { env, repo, owner, token };
  console.log(core_inputs) // TODO;
  it("Validate Input Environment", async () => {
    const passed = [env, repo, owner, token].every(v => v);
    expect(passed).toEqual(true);
  })
  it("Create Environment Secret", async () => {
    const sock = toSockSecret({ env });
    const passed = sock != null;
    expect(passed).toEqual(true);
  })
});
