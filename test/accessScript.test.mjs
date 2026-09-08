/**
 * scripts/access.sh, against a stub `gcloud`.
 *
 * The script's whole job is to turn four separate IAM reads into one answer, so what is worth
 * testing is the shape of the calls it makes and the verdict it reaches — neither of which
 * needs a project. A stub first on PATH records every invocation and replays canned policy
 * output; nothing here touches a network.
 */

import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/access.sh", import.meta.url));
const ROLE = "roles/iap.httpsResourceAccessor";
const IAP_AGENT = "serviceAccount:service-123456789@gcp-sa-iap.iam.gserviceaccount.com";

const STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GCLOUD_LOG"
for arg in "$@"; do
  case "$arg" in
    --condition-from-file=*)
      echo "CONDITION-FILE-BEGIN" >> "$GCLOUD_LOG"
      cat "\${arg#*=}" >> "$GCLOUD_LOG"
      echo "CONDITION-FILE-END" >> "$GCLOUD_LOG"
      ;;
  esac
done
case "$1:$2:$3" in
  iap:web:get-iam-policy) cat "$IAP_POLICY_FILE" ;;
  iap:web:add-iam-policy-binding) : ;;
  iap:web:remove-iam-policy-binding) : ;;
  projects:get-iam-policy:*) cat "$PROJECT_POLICY_FILE" ;;
  projects:describe:*) echo "\${PROJECT_NUMBER_OUT-123456789}" ;;
  run:services:get-iam-policy) cat "$RUN_POLICY_FILE" ;;
  run:services:describe) echo "\${SERVICE_URL_OUT-https://extraction-abc.a.run.app}" ;;
  identity:groups:memberships)
    if [[ "\${GROUP_CHECK-}" == "unreadable" ]]; then exit 1; fi
    for arg in "$@"; do
      case "$arg" in
        --member-email=*) member="\${arg#*=}" ;;
      esac
    done
    if [[ "\${GROUP_MEMBER-}" == "$member" ]]; then echo True; else echo False; fi
    ;;
  config:get-value:project) echo stub-project ;;
  *) echo "stub gcloud: unhandled invocation: $*" >&2; exit 64 ;;
esac
`;

const workdirs = [];
after(() => workdirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/**
 * @param {string[]} args
 * @param {{iap?: string[], project?: string[], invokers?: string[], groupMember?: string,
 *          groupCheck?: string}} world
 */
function run(args, world = {}) {
  const dir = mkdtempSync(join(tmpdir(), "extraction-access-"));
  workdirs.push(dir);
  const gcloud = join(dir, "gcloud");
  writeFileSync(gcloud, STUB);
  chmodSync(gcloud, 0o755);

  const files = {
    IAP_POLICY_FILE: (world.iap ?? []).join("\n"),
    PROJECT_POLICY_FILE: (world.project ?? []).join("\n"),
    RUN_POLICY_FILE: (world.invokers ?? [IAP_AGENT]).join("\n"),
  };
  const env = {
    PATH: `${dir}:${process.env.PATH}`,
    HOME: process.env.HOME,
    GCLOUD_LOG: join(dir, "calls.log"),
    PROJECT: "test-project",
    REGION: "us-central1",
    SERVICE: "extraction",
  };
  for (const [name, body] of Object.entries(files)) {
    const path = join(dir, name);
    writeFileSync(path, body ? `${body}\n` : "");
    env[name] = path;
  }
  if (world.groupMember) env.GROUP_MEMBER = world.groupMember;
  if (world.groupCheck) env.GROUP_CHECK = world.groupCheck;
  writeFileSync(env.GCLOUD_LOG, "");

  const result = spawnSync("bash", [SCRIPT, ...args], { env, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    calls: readFileSync(env.GCLOUD_LOG, "utf8"),
  };
}

/** A binding line as the script's --format would emit it. */
const binding = (member, { title = "", expression = "", description = "" } = {}) =>
  [ROLE, member, title, expression, description].join("|");
const projectBinding = (member, condition = "") => [member, condition].join("|");

const mutations = (calls) =>
  calls.split("\n").filter((line) => line.includes("iam-policy-binding"));

describe("access.sh grant", () => {
  it("reads a bare email as a user: principal and grants the accessor role", () => {
    const { status, stdout, calls } = run(["grant", "Dan@Example.com"]);
    assert.equal(status, 0);
    const [add] = mutations(calls);
    assert.match(add, /^iap web add-iam-policy-binding/);
    assert.match(add, /--resource-type=cloud-run/);
    assert.match(add, /--service=extraction/);
    assert.match(add, /--region=us-central1/);
    assert.match(add, /--member=user:dan@example\.com/);
    assert.match(add, new RegExp(`--role=${ROLE.replace(".", "\\.")}`));
    assert.match(add, /--condition=None/);
    assert.match(stdout, /read 'Dan@Example\.com' as user:dan@example\.com/);
  });

  it("puts the address to sign in with, and both failure modes, in the invite", () => {
    const { stdout } = run(["grant", "dan@example.com"]);
    assert.match(stdout, /https:\/\/extraction-abc\.a\.run\.app/);
    assert.match(stdout, /Sign in with dan@example\.com/);
    assert.match(stdout, /incognito/);
    assert.match(stdout, /403/);
    assert.match(stdout, /shared pile, not a private notebook/);
  });

  it("refuses allAuthenticatedUsers without --i-mean-it", () => {
    const { status, stderr, calls } = run(["grant", "allAuthenticatedUsers"]);
    assert.notEqual(status, 0);
    assert.equal(mutations(calls).length, 0);
    assert.match(stderr, /anyone with a Google account/);
  });

  it("grants allAuthenticatedUsers when the flag is given", () => {
    const { status, calls } = run(["grant", "allAuthenticatedUsers", "--i-mean-it"]);
    assert.equal(status, 0);
    assert.match(mutations(calls)[0], /--member=allAuthenticatedUsers/);
  });

  it("rejects a malformed --until before calling anything", () => {
    const { status, stderr, calls } = run(["grant", "dan@example.com", "--until", "next-tuesday"]);
    assert.notEqual(status, 0);
    assert.equal(calls.trim(), "");
    assert.match(stderr, /YYYY-MM-DD/);
  });

  it("passes an expiry as a condition file rather than a comma-separated flag", () => {
    const { status, calls } = run(["grant", "dan@example.com", "--until", "2026-10-01"]);
    assert.equal(status, 0);
    assert.match(calls, /--condition-from-file=/);
    assert.match(calls, /title: 'extraction_until_2026_10_01'/);
    assert.match(calls, /expression: 'request\.time < timestamp\("2026-10-01T00:00:00Z"\)'/);
  });

  it("is idempotent: an existing unconditional binding is left alone", () => {
    const { status, stdout, calls } = run(["grant", "dan@example.com"], {
      iap: [binding("user:dan@example.com")],
    });
    assert.equal(status, 0);
    assert.equal(mutations(calls).length, 0);
    assert.match(stdout, /already granted/);
  });

  it("--dry-run prints the mutation instead of making it", () => {
    const { status, stdout, calls } = run(["grant", "dan@example.com", "--dry-run"]);
    assert.equal(status, 0);
    assert.equal(mutations(calls).length, 0);
    assert.match(stdout, /would run: gcloud iap web add-iam-policy-binding/);
  });
});

describe("access.sh check", () => {
  it("exits 0 on a direct binding", () => {
    const { status, stdout } = run(["check", "dan@example.com"], {
      iap: [binding("user:dan@example.com")],
    });
    assert.equal(status, 0);
    assert.match(stdout, /==> YES/);
  });

  it("exits 1 when no binding reaches them", () => {
    const { status, stdout } = run(["check", "dan@example.com"], {
      iap: [binding("user:someone-else@example.com")],
    });
    assert.equal(status, 1);
    assert.match(stdout, /==> NO/);
  });

  it("sees a project-level binding the service's own policy cannot show", () => {
    const { status, stdout } = run(["check", "dan@example.com"], {
      project: [projectBinding("user:dan@example.com")],
    });
    assert.equal(status, 0);
    assert.match(stdout, /granted project-wide/);
  });

  it("resolves membership of a group that holds the role", () => {
    const { status, stdout } = run(["check", "dan@example.com"], {
      iap: [binding("group:workshop@acme.com")],
      groupMember: "dan@example.com",
    });
    assert.equal(status, 0);
    assert.match(stdout, /granted via group workshop@acme\.com/);
  });

  it("exits 1, not 2, when the group is readable and they are not in it", () => {
    const { status, stdout } = run(["check", "dan@example.com"], {
      iap: [binding("group:workshop@acme.com")],
      groupMember: "someone-else@example.com",
    });
    assert.equal(status, 1);
    assert.match(stdout, /not a member of workshop@acme\.com/);
  });

  it("exits 2 when a group holding the role cannot be read", () => {
    const { status, stdout } = run(["check", "dan@example.com"], {
      iap: [binding("group:workshop@acme.com")],
      groupCheck: "unreadable",
    });
    assert.equal(status, 2);
    assert.match(stdout, /UNDETERMINED/);
    assert.match(stdout, /could not read the membership of workshop@acme\.com/);
  });

  it("counts a domain binding that covers their address", () => {
    const { status, stdout } = run(["check", "dan@acme.com"], {
      iap: [binding("domain:acme.com")],
    });
    assert.equal(status, 0);
    assert.match(stdout, /via domain:acme\.com/);
  });

  it("reports the condition on a binding that carries one", () => {
    const { status, stdout } = run(["check", "dan@example.com"], {
      iap: [
        binding("user:dan@example.com", {
          title: "extraction_until_2026_10_01",
          expression: 'request.time < timestamp("2026-10-01T00:00:00Z")',
        }),
      ],
    });
    assert.equal(status, 0);
    assert.match(stdout, /conditionally — extraction_until_2026_10_01/);
  });

  it("warns when the IAP service agent has lost run.invoker", () => {
    const { stderr } = run(["check", "dan@example.com"], {
      iap: [binding("user:dan@example.com")],
      invokers: ["serviceAccount:someone-else@test-project.iam.gserviceaccount.com"],
    });
    assert.match(stderr, /does NOT hold run\.invoker/);
    assert.match(stderr, /locked out regardless/);
  });
});

describe("access.sh revoke", () => {
  it("removes an unconditional binding", () => {
    const { status, calls } = run(["revoke", "dan@example.com"], {
      iap: [binding("user:dan@example.com")],
    });
    assert.equal(status, 0);
    const [remove] = mutations(calls);
    assert.match(remove, /^iap web remove-iam-policy-binding/);
    assert.match(remove, /--member=user:dan@example\.com/);
    assert.match(remove, /--condition=None/);
  });

  it("replays the exact condition of a conditional binding, quotes and all", () => {
    const { status, calls } = run(["revoke", "dan@example.com"], {
      iap: [
        binding("user:dan@example.com", {
          title: "extraction_until_2026_10_01",
          expression: 'request.time < timestamp("2026-10-01T00:00:00Z")',
          description: "Extraction access expires 2026-10-01",
        }),
      ],
    });
    assert.equal(status, 0);
    assert.match(calls, /--condition-from-file=/);
    assert.match(calls, /title: 'extraction_until_2026_10_01'/);
    assert.match(calls, /expression: 'request\.time < timestamp\("2026-10-01T00:00:00Z"\)'/);
    assert.match(calls, /description: 'Extraction access expires 2026-10-01'/);
  });

  it("says so rather than failing when there is nothing to remove", () => {
    const { status, stdout, calls } = run(["revoke", "dan@example.com"]);
    assert.equal(status, 0);
    assert.equal(mutations(calls).length, 0);
    assert.match(stdout, /no binding on this service to remove/);
  });

  it("will not remove a project-level binding, but names it and prints the command", () => {
    const { status, stderr, calls } = run(["revoke", "dan@example.com"], {
      project: [projectBinding("user:dan@example.com")],
    });
    assert.equal(status, 0);
    assert.equal(mutations(calls).length, 0);
    assert.match(stderr, /also holds .* at the project level/);
    assert.match(stderr, /gcloud projects remove-iam-policy-binding test-project/);
  });

  it("points at the group when access also arrives through one", () => {
    const { stdout } = run(["revoke", "dan@example.com"], {
      iap: [binding("user:dan@example.com"), binding("group:workshop@acme.com")],
    });
    assert.match(stdout, /group:workshop@acme\.com/);
    assert.match(stdout, /the directory's job/);
  });

  it("is explicit that the pile keeps what they contributed", () => {
    const { stdout } = run(["revoke", "dan@example.com"], {
      iap: [binding("user:dan@example.com")],
    });
    assert.match(stdout, /fragments stay in the pile/);
  });
});

describe("access.sh list", () => {
  it("shows service and project-level bindings separately", () => {
    const { status, stdout } = run(["list"], {
      iap: [binding("user:dan@example.com"), binding("group:workshop@acme.com")],
      project: [projectBinding("user:admin@example.com")],
    });
    assert.equal(status, 0);
    assert.match(stdout, /user:dan@example\.com {2}roles\/iap\.httpsResourceAccessor/);
    assert.match(stdout, /group:workshop@acme\.com/);
    assert.match(stdout, /Project-wide holders/);
    assert.match(stdout, /user:admin@example\.com/);
  });

  it("says plainly when nobody can reach it", () => {
    const { stdout } = run(["list"]);
    assert.match(stdout, /\(none — nobody can reach it\)/);
  });

  it("names the consent screen, which no IAM read can answer", () => {
    const { stdout } = run(["list"]);
    assert.match(stdout, /test users/);
    assert.match(stdout, /console\.cloud\.google\.com\/auth\/audience/);
  });
});

describe("access.sh usage", () => {
  it("rejects an unknown command", () => {
    const { status, stderr } = run(["grantt", "dan@example.com"]);
    assert.notEqual(status, 0);
    assert.match(stderr, /unknown command/);
  });

  it("is executable and passes a syntax check", () => {
    execFileSync("bash", ["-n", SCRIPT]);
  });
});
