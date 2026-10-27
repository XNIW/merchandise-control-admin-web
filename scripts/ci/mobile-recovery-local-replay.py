"""Guarded Linux CI replay. Canonical migration files stay unchanged in the checkout."""
import sys
if sys.version_info < (3, 11):
    raise SystemExit("Python 3.11 or newer is required; no automatic installation")
import argparse, hashlib, io, json, os, re, shutil, signal, socket, subprocess, tarfile, tomllib, uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

CLI_VERSION = "2.109.0"
PRICE = "20261027015232_mobile_recovery_checkpoint_price_custom_plan.sql"
TARGET = "20261027143737_mobile_recovery_preflight_metadata_custom_plan.sql"
OP_SHA = "9fa653cbd503626ca4e7de2ba957b0cc4274cd604489a9e89998f8e65a397357"
PRICE_SHA = "b1334a1ad5573fe498aa4b66bec07c871ef21c90f8ad1d40ffe6944115f8e262"
BODY_SHA = "09ffea10ac2008db3ac845d00760167ef5737cfe298898ad0bce61583a210f2b"
HERE = Path(__file__).resolve().parent
ERROR_ROOT = None
EVIDENCE_ROOT = None
REPLAY_STAGE = "preparation"
SNAPSHOT_SHA = "0dc0cd55a9e2583d6e99d37c7da47dece7628c9967c87b0aef692963b0d54cec"
OID_KEYS = {"oid", "pronamespace", "proowner", "prolang", "prorettype", "proargtypes"}

def require(ok, message):
    if not ok:
        raise ValueError(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def md5(data):
    return hashlib.md5(data).hexdigest()

def run(argv):
    # No shell, arbitrary URL, linked/project-ref/profile flags, or user SQL.
    r = subprocess.run(argv, capture_output=True, check=False, timeout=1200)
    if r.returncode != 0:
        if ERROR_ROOT is not None:
            name = uuid.uuid4().hex
            directory = ERROR_ROOT / ".replay" / "errors"
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            (directory / (name + ".stdout")).write_bytes(r.stdout)
            (directory / (name + ".stderr")).write_bytes(r.stderr)
            (directory / (name + ".json")).write_text(json.dumps({"argv": argv, "exit": r.returncode}))
        raise ValueError("command failed; private evidence retained; no retry")
    return r.stdout

def put(path, data):
    require(not path.exists() and not path.is_symlink(), "output already exists")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

def dump(path, value):
    put(path, (json.dumps(value, indent=2) + "\n").encode())

def claim_apply_attempt(path, value):
    # Any existing/partial latch consumes the attempt. Never unlink on failure.
    data = (json.dumps(value, indent=2) + "\n").encode()
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise ValueError("apply attempt already consumed") from None
    try:
        remaining = memoryview(data)
        while remaining:
            written = os.write(fd, remaining)
            require(written > 0, "incomplete apply-attempt write")
            remaining = remaining[written:]
        os.fsync(fd)
    finally:
        os.close(fd)
    parent_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(parent_fd)
    finally:
        os.close(parent_fd)

def root_path(value):
    p = Path(value)
    require(not p.is_symlink(), "workdir symlink")
    p = p.resolve()
    require(p.is_dir(), "missing owned workdir")
    require(not (p / "supabase/.temp/project-ref").exists(), "linked project forbidden")
    return p

def config(root):
    t = tomllib.loads((root / "supabase/config.toml").read_text())
    require(re.fullmatch(r"r4-ci-preflight-[0-9a-f]{12}", t["project_id"]), "unknown local project")
    require(t["db"]["major_version"] == 17, "Postgres version drift")
    return t

def cli(root, *args):
    require(run(["supabase", "--version"]).decode().strip() == CLI_VERSION, "CLI version drift")
    allowed = (("status", "--output", "json"),
               ("db", "query", "--local", "--file", str(HERE / "local-snapshot.sql"), "--output", "json"))
    require(args in allowed, "only fixed local status/catalog commands are supported")
    return run(["supabase", "--workdir", str(root), *args])

def body(operator):
    marker = b"AS $function$"
    start = operator.index(marker) + len(marker)
    end = operator.index(b"$function$", start)
    return operator[start:end]

def prefix_manifest(root):
    m = json.loads((root / ".replay/inputs.json").read_text())
    for path, digest in m["files"].items():
        p = root / path
        require(not p.is_symlink() and p.is_file() and p.resolve().is_relative_to(root)
                and not any(q.is_symlink() for q in p.parents if q != root.parent)
                and sha(p.read_bytes()) == digest, "input drift")
    require(sha((root / ".replay/operator.sql").read_bytes()) == OP_SHA, "operator drift")
    declared = {k for k in m["files"] if k.startswith("supabase/migrations/")}
    target = root / "supabase/migrations" / TARGET
    if target.exists() or target.is_symlink():
        require(not target.is_symlink() and target.resolve().is_relative_to(root), "target escape")
        binding = json.loads((root / ".replay/binding.json").read_text())
        require(sha(target.read_bytes()) == binding["derivedLOCALSHA256"], "bound target drift")
        declared.add("supabase/migrations/" + TARGET)
    observed = {str(p.relative_to(root)) for p in (root / "supabase/migrations").rglob("*")
                if p.is_file() or p.is_symlink()}
    require(observed == declared, "extra or missing migration input")
    return m

def migration_version(name):
    match = re.fullmatch(r"([0-9]+)_[A-Za-z0-9_-]+\.sql", name)
    require(match is not None, "unknown migration filename")
    return match.group(1)

def local_config_bytes(data, project):
    # Linux CI keeps every configured port and all non-project bytes from HEAD.
    before = tomllib.loads(data.decode())
    require(re.fullmatch(r"r4-ci-preflight-[0-9a-f]{12}", project) is not None, "project locator shape")
    changed, count = re.subn(r'(?m)^([ \t]*project_id[ \t]*=[ \t]*")([^"\r\n]*)(")',
                             lambda match: match[1] + project + match[3], data.decode())
    require(count == 1, "project locator shape")
    inverse, count = re.subn(r'(?m)^([ \t]*project_id[ \t]*=[ \t]*")([^"\r\n]*)(")',
                             lambda match: match[1] + before["project_id"] + match[3], changed)
    require(count == 1 and inverse.encode() == data, "config changed beyond project locator")
    require(tomllib.loads(changed)["db"]["port"] == 54322, "Linux CI DB port drift")
    return changed.encode()

def prepare(repo, workdir):
    repo = Path(repo).resolve()
    out = Path(workdir)
    require(not out.exists(), "workdir must be new")
    operator = (repo / "supabase/migrations" / TARGET).read_bytes()
    price = (repo / "supabase/migrations" / PRICE).read_bytes()
    require(sha(operator) == OP_SHA and sha(price) == PRICE_SHA, "source hash drift")
    require(sha(body(operator)) == BODY_SHA, "payload body drift")
    archive = run(["git", "-C", str(repo), "archive", "--format=tar", "HEAD", "supabase"])
    out.mkdir(mode=0o700, parents=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar.getmembers():
            path = Path(member.name)
            require(not path.is_absolute() and ".." not in path.parts and path.parts[0] == "supabase",
                    "archive escape")
            require(member.isdir() or member.isfile(), "archive link or special file")
            if member.isfile():
                put(out / path, tar.extractfile(member).read())
    migration_dir = out / "supabase/migrations"
    # Only the two reviewed R4 overlays; every other file came from HEAD, not WIP.
    for name, data in ((PRICE, price), (TARGET, operator)):
        q = migration_dir / name
        if q.exists():
            require(q.read_bytes() == data, "tracked overlay drift")
        elif name == PRICE:
            put(q, data)
    target = migration_dir / TARGET
    if target.exists():
        require(target.read_bytes() == operator, "withheld file drift")
        target.unlink()  # New owned copy only; source/ledger are never modified.
    versions = []
    for p in sorted(migration_dir.glob("*.sql")):
        version = migration_version(p.name)
        require(version < TARGET[:14], "later migration needs explicit ordering review")
        versions.append(version)
    versions.sort()
    require(len(versions) == len(set(versions)) and PRICE[:14] in versions, "prefix history drift")
    cfg_path = out / "supabase/config.toml"
    original = cfg_path.read_bytes()
    project = "r4-ci-preflight-" + uuid.uuid4().hex[:12]
    changed = local_config_bytes(original, project)
    cfg_path.write_bytes(changed)
    files = {str(p.relative_to(out)): sha(p.read_bytes())
             for p in sorted((out / "supabase").rglob("*")) if p.is_file()}
    dump(out / ".replay/inputs.json",
         {"head": run(["git", "-C", str(repo), "rev-parse", "HEAD"]).decode().strip(),
          "files": files, "versions": versions, "project": project,
          "configOriginalSHA256": sha(original), "onlyConfigChange": "local project_id; Linux HEAD ports unchanged"})
    put(out / ".replay/operator.sql", operator)

def local_docker():
    docker_host = os.environ.get("DOCKER_HOST", "")
    require(not docker_host or docker_host.startswith("unix://"), "remote Docker forbidden")
    endpoint = json.loads(run(["docker", "context", "inspect", "--format",
                              "{{json .Endpoints.docker.Host}}"]))
    require(endpoint.startswith("unix://"), "non-local Docker context")

def empty_local(root):
    config(root)
    prefix_manifest(root)
    require(run(["supabase", "--version"]).decode().strip() == CLI_VERSION, "CLI version drift")
    local_docker()
    name = "supabase_db_" + config(root)["project_id"]
    require(not run(["docker", "ps", "-a", "--filter", "name=^/" + name + "$",
                     "--format", "{{.ID}}"]).strip(), "existing project must not be reused")
    cfg = config(root)
    def ports(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if "port" in key and isinstance(item, int) and not isinstance(item, bool):
                    yield item
                yield from ports(item)
    for port in ports(cfg):
        with socket.socket() as s:
            s.bind(("127.0.0.1", port))  # Busy means STOP, no port search/reset.
    dump(root / ".replay/empty-local.json",
         {"checkedUTC": datetime.now(timezone.utc).isoformat(), "project": cfg["project_id"],
          "dockerEndpointKind": "unix", "workdir": str(root)})

def require_owned_creation(root, cfg, gate, container):
    proof_path, start_path = root / ".replay/owned-creation.json", root / ".replay/owned-start.json"
    require(proof_path.is_file() and not proof_path.is_symlink() and
            start_path.is_file() and not start_path.is_symlink(), "missing owned creation proof")
    proof = json.loads(proof_path.read_text())
    fields = {"kind", "project", "workdir", "gateSHA256", "inputsSHA256", "configSHA256",
              "startRecordSHA256", "cliExecutableSHA256", "goExecutableSHA256", "containerID",
              "containerCreated", "hostDBPort", "observedAtUTC"}
    require(set(proof) == fields and proof["kind"] == "OBSERVED_OWNED_CREATION_V1", "creation proof shape")
    require(proof["project"] == cfg["project_id"] == gate["project"] and
            proof["workdir"] == str(root) == gate["workdir"], "creation workdir/project mismatch")
    prefix = prefix_manifest(root)
    require(prefix["project"] == cfg["project_id"] and
            sha((root / ".replay/empty-local.json").read_bytes()) == proof["gateSHA256"] and
            sha((root / ".replay/inputs.json").read_bytes()) == proof["inputsSHA256"] and
            sha((root / "supabase/config.toml").read_bytes()) == proof["configSHA256"] and
            sha(start_path.read_bytes()) == proof["startRecordSHA256"], "creation input drift")
    start = json.loads(start_path.read_text())
    executable = shutil.which("supabase")
    require(isinstance(executable, str) and Path(executable).is_absolute(), "missing owned CLI")
    executable = Path(executable).resolve()
    companion = executable.parent / "supabase-go"
    require(executable.is_file() and companion.is_file() and not companion.is_symlink() and
            sha(executable.read_bytes()) == proof["cliExecutableSHA256"] and
            sha(companion.read_bytes()) == proof["goExecutableSHA256"], "creation executable drift")
    require(start["phase"] == "prefix-bootstrap" and type(start["pid"]) is int and start["pid"] > 0 and
            start["argv"] == [str(executable), "--workdir", str(root), "start"], "creation start mismatch")
    gate_at = datetime.fromisoformat(gate["checkedUTC"])
    started = datetime.fromisoformat(start["startedUTC"])
    created = datetime.fromisoformat(container["created"].replace("Z", "+00:00"))
    observed = datetime.fromisoformat(proof["observedAtUTC"])
    require(all(x.tzinfo is not None for x in (gate_at, started, created, observed)) and
            gate_at <= started <= created <= observed <= datetime.now(timezone.utc), "creation time mismatch")
    require(re.fullmatch(r"[0-9a-f]{64}", proof["containerID"]) is not None and
            proof["containerID"] == container["id"] and proof["containerCreated"] == container["created"] and
            type(proof["hostDBPort"]) is int and proof["hostDBPort"] == cfg["db"]["port"] ==
            54322 and container["health"] == "healthy" and
            {int(x["HostPort"]) for x in container["ports"].get("5432/tcp", [])} == {proof["hostDBPort"]},
            "creation container/health/port mismatch")

def local_endpoint(root):
    local_docker()
    cfg = config(root)
    gate = json.loads((root / ".replay/empty-local.json").read_text())
    require(gate["project"] == cfg["project_id"] and gate["workdir"] == str(root), "ownership gate drift")
    status = json.loads(cli(root, "status", "--output", "json"))
    url = urlparse(status["DB_URL"])  # Credentials stay in memory; never print/write status.
    require(url.scheme in ("postgres", "postgresql") and url.hostname in ("127.0.0.1", "::1")
            and url.port == cfg["db"]["port"] and url.path == "/postgres" and url.username == "postgres", "non-local DB endpoint")
    fmt = '{"id":{{json .Id}},"created":{{json .Created}},"running":{{json .State.Running}},' \
          '"labels":{{json .Config.Labels}},"ports":{{json .NetworkSettings.Ports}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}'
    d = json.loads(run(["docker", "inspect", "--type", "container", "--format", fmt,
                       "supabase_db_" + cfg["project_id"]]))
    labels = d["labels"]
    require(d["running"] and labels.get("com.supabase.cli.project") == cfg["project_id"], "wrong container")
    label_workdir = labels.get("com.supabase.cli.workdir")
    if label_workdir is None or label_workdir == "":
        require_owned_creation(root, cfg, gate, d)
    else:
        require(isinstance(label_workdir, str) and Path(label_workdir).is_absolute() and
                Path(label_workdir).resolve() == root, "wrong container workdir")
    require(datetime.fromisoformat(d["created"].replace("Z", "+00:00")) >=
            datetime.fromisoformat(gate["checkedUTC"]), "preexisting container")
    require(any(int(x["HostPort"]) == url.port for x in d["ports"].get("5432/tcp", [])),
            "port/container mismatch")
    return {"containerID": d["id"], "project": cfg["project_id"], "host": url.hostname,
            "port": url.port, "workdir": str(root), "CLI": CLI_VERSION, "target": "LOCAL"}

def snapshot(root):
    require(sha((HERE / "local-snapshot.sql").read_bytes()) == SNAPSHOT_SHA, "readonly SQL drift")
    raw = json.loads(cli(root, "db", "query", "--local", "--file", str(HERE / "local-snapshot.sql"),
                         "--output", "json"))
    rows = raw.get("rows") if isinstance(raw, dict) else raw
    require(isinstance(rows, list) and len(rows) == 1 and set(rows[0]) == {"snapshot"}, "query shape")
    return rows[0]["snapshot"]

def portable(function):
    raw = json.loads(function["metadataText"])
    require(md5(function["metadataText"].encode()) == function["metadataMD5"], "metadata hash tamper")
    normalized = {k: v for k, v in raw.items() if k not in OID_KEYS}
    normalized.update(function["names"])
    require(str(raw["oid"]) == str(function["oid"]), "OID mismatch")
    return normalized

def derive(operator, data, expected, versions):
    require(sha(operator) == OP_SHA and sha(body(operator)) == BODY_SHA, "operator hash drift")
    require(data["database"] == "postgres" and data["effectiveRole"] == "postgres"
            and data["serverMajor"] == "17", "local database/operator drift")
    require(data["versions"] == versions and data["localStatement"] is None, "not exact fresh prefix")
    require(data["authenticatedConfig"] == expected["authenticatedConfig"], "auth8s drift")
    for name in ("helper", "public"):
        f, e = data["functions"][name], expected["functions"][name]
        require(sha(f["body"].encode()) == e["bodySHA256"], "unknown old source")
        require(md5(f["definition"].encode()) == e["definitionMD5"], "whole definition drift")
        require(portable(f) == e["portable"], "logical metadata/ACL drift")
    f = data["functions"]
    oid = str(f["helper"]["oid"])
    require(re.fullmatch(r"[1-9][0-9]{0,9}", oid) and int(oid) < 2**32, "invalid OID")
    values = [(b"'58221'::oid", ("'" + oid + "'::oid").encode()),
              (b"'8e8498b3f5806524566080bd618f298d'", ("'" + f["helper"]["metadataMD5"] + "'").encode()),
              (b"'86c0b470d66981611c9de809545bb378'", ("'" + f["public"]["metadataMD5"] + "'").encode())]
    result = operator
    for old, new in values:
        require(operator.count(old) == 1, "guard token count drift")
        require(re.fullmatch(rb"'[0-9a-f]{32}'", new) if b"::oid" not in new else True, "unknown hash")
        result = result.replace(old, new, 1)
    inverse = result
    for old, new in reversed(values):
        require(inverse.count(new) == 1, "ambiguous inverse")
        inverse = inverse.replace(new, old, 1)
    require(inverse == operator and body(result) == body(operator), "inverse/body mismatch")
    return result

def load_expected():
    data = (HERE / "expected-preimage.json").read_bytes()
    require(sha(data) == EXPECTED_SHA, "expected template hash drift")
    return json.loads(data)

def bind(root):
    m = prefix_manifest(root)
    endpoint = local_endpoint(root)
    data = snapshot(root)
    derived = derive((root / ".replay/operator.sql").read_bytes(), data, load_expected(), m["versions"])
    dump(root / ".replay/before.json", {"endpoint": endpoint, "snapshot": data})
    put(root / "supabase/migrations" / TARGET, derived)
    dump(root / ".replay/binding.json",
         {"operatorSHA256": OP_SHA, "derivedLOCALSHA256": sha(derived), "bodySHA256": BODY_SHA,
          "inverseSHA256": OP_SHA, "permittedConstantSlots": 3,
          "localOID": data["functions"]["helper"]["oid"],
          "localHelperMetadataMD5": data["functions"]["helper"]["metadataMD5"],
          "localPublicMetadataMD5": data["functions"]["public"]["metadataMD5"],
          "isOperatorSQLByteExactReplay": False})

def apply_local(root):
    m = prefix_manifest(root)
    local_endpoint(root)
    binding = json.loads((root / ".replay/binding.json").read_text())
    before = json.loads((root / ".replay/before.json").read_text())["snapshot"]
    expected = derive((root / ".replay/operator.sql").read_bytes(), before, load_expected(), m["versions"])
    require((root / "supabase/migrations" / TARGET).read_bytes() == expected
            and sha(expected) == binding["derivedLOCALSHA256"], "derived file drift")
    claim_apply_attempt(root / ".replay/apply-attempt.json",
         {"target": "LOCAL_ONLY", "operatorSHA256": OP_SHA, "derivedLOCALSHA256": sha(expected),
          "oneAttemptOnly": True, "failureOrUnknown": "STOP_NO_AUTORETRY"})
    output = run(["supabase", "--workdir", str(root), "migration", "up", "--local"])
    put(root / ".replay/apply.stdout", output)

def verify(root):
    m = prefix_manifest(root)
    endpoint = local_endpoint(root)
    before = json.loads((root / ".replay/before.json").read_text())["snapshot"]
    after = snapshot(root)
    derived = (root / "supabase/migrations" / TARGET).read_bytes()
    require(after["versions"] == m["versions"] + [TARGET[:14]], "local history mismatch")
    require(after["localStatement"] == derived.decode().strip().removesuffix(";").strip(),
            "CLI SplitAndTrim ledger mismatch")
    require(all(after[key] == before[key] for key in ("database", "effectiveRole", "serverMajor")),
            "local execution identity changed")
    require(after["authenticatedConfig"] == before["authenticatedConfig"], "auth config changed")
    for name in ("helper", "public"):
        old, new = before["functions"][name], after["functions"][name]
        require(old["metadataText"] == new["metadataText"], "metadata changed")
        if name == "helper":
            require(sha(new["body"].encode()) == BODY_SHA and new["definition"] ==
                    old["definition"].replace(old["body"], body(derived).decode(), 1), "new body drift")
        else:
            require(new == old, "public RPC changed")
    dump(root / ".replay/verified.json",
         {"status": "LOCAL_DERIVED_ENVELOPE_VERIFIED_NOT_OPERATOR_SQL_REPLAY",
          "endpoint": endpoint, "operatorSHA256": OP_SHA, "derivedLOCALSHA256": sha(derived),
          "bodySHA256": BODY_SHA, "wholeMetadataPreserved": True, "auth8sPreserved": True,
          "localLedgerVersion": TARGET[:14], "CLI": CLI_VERSION, "pgTAP": "NOT_RUN"})

def cli_binary():
    executable = shutil.which("supabase")
    require(isinstance(executable, str) and Path(executable).is_absolute(), "missing CLI")
    executable = Path(executable).resolve()
    companion = executable.parent / "supabase-go"
    require(executable.is_file() and companion.is_file() and not companion.is_symlink(),
            "missing CLI companion")
    require(run([str(executable), "--version"]).decode().strip() == CLI_VERSION, "CLI version drift")
    return executable, sha(executable.read_bytes()), sha(companion.read_bytes())

def reap_owned_start(process):
    if process.poll() is not None:
        return process.returncode
    try:
        require(os.getpgid(process.pid) == process.pid, "start process ownership changed")
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return process.wait(timeout=5)
    try:
        return process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        require(os.getpgid(process.pid) == process.pid, "start process ownership changed")
        os.killpg(process.pid, signal.SIGKILL)
        return process.wait(timeout=5)

def start_prefix(root):
    # A fresh gate and one owned CLI invocation; no retry or container cleanup.
    prefix_manifest(root)
    cfg = config(root)
    gate = json.loads((root / ".replay/empty-local.json").read_text())
    require(gate["project"] == cfg["project_id"] and gate["workdir"] == str(root), "start gate drift")
    executable, executable_sha, companion_sha = cli_binary()
    argv = [str(executable), "--workdir", str(root), "start"]
    claim_apply_attempt(root / ".replay/start-attempt.json",
                        {"argv": argv, "project": cfg["project_id"], "oneAttemptOnly": True})
    started = datetime.now(timezone.utc).isoformat()
    timed_out = False
    with (root / ".replay/start.stdout").open("xb") as stdout, \
            (root / ".replay/start.stderr").open("xb") as stderr:
        process = subprocess.Popen(argv, stdout=stdout, stderr=stderr, start_new_session=True)
        try:
            dump(root / ".replay/owned-start.json",
                 {"phase": "prefix-bootstrap", "pid": process.pid, "argv": argv, "startedUTC": started})
            try:
                code = process.wait(timeout=1200)
            except subprocess.TimeoutExpired:
                timed_out = True
                code = reap_owned_start(process)
        finally:
            # Evidence write failure must not leave the owned startup CLI running.
            reap_owned_start(process)
    result = {"exit": code, "timedOut": timed_out, "finishedUTC": datetime.now(timezone.utc).isoformat(),
              "startRecordSHA256": sha((root / ".replay/owned-start.json").read_bytes()),
              "cliExecutableSHA256": executable_sha, "goExecutableSHA256": companion_sha,
              "stdoutSHA256": sha((root / ".replay/start.stdout").read_bytes()),
              "stderrSHA256": sha((root / ".replay/start.stderr").read_bytes())}
    dump(root / ".replay/start-result.json", result)
    require(not timed_out and code == 0, "prefix startup failed; no bind/apply/test or automatic retry")

def observe_owned_creation(root):
    # CLI 2.109 may omit its workdir label. Observe actual creation instead of inventing a label.
    cfg = config(root)
    prefix_manifest(root)
    result = json.loads((root / ".replay/start-result.json").read_text())
    require(result["exit"] == 0 and result["timedOut"] is False and
            result["startRecordSHA256"] == sha((root / ".replay/owned-start.json").read_bytes()),
            "prefix startup not successful")
    executable, executable_sha, companion_sha = cli_binary()
    require(executable_sha == result["cliExecutableSHA256"] and
            companion_sha == result["goExecutableSHA256"], "start executable drift")
    local_docker()
    fmt = '{"id":{{json .Id}},"created":{{json .Created}},"running":{{json .State.Running}},' \
          '"labels":{{json .Config.Labels}},"ports":{{json .NetworkSettings.Ports}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}'
    container = json.loads(run(["docker", "inspect", "--type", "container", "--format", fmt,
                                "supabase_db_" + cfg["project_id"]]))
    require(container["running"] and container["labels"].get("com.supabase.cli.project") == cfg["project_id"],
            "wrong observed container")
    proof = {"kind": "OBSERVED_OWNED_CREATION_V1", "project": cfg["project_id"], "workdir": str(root),
             "gateSHA256": sha((root / ".replay/empty-local.json").read_bytes()),
             "inputsSHA256": sha((root / ".replay/inputs.json").read_bytes()),
             "configSHA256": sha((root / "supabase/config.toml").read_bytes()),
             "startRecordSHA256": result["startRecordSHA256"],
             "cliExecutableSHA256": executable_sha, "goExecutableSHA256": companion_sha,
             "containerID": container["id"], "containerCreated": container["created"],
             "hostDBPort": cfg["db"]["port"], "observedAtUTC": datetime.now(timezone.utc).isoformat()}
    dump(root / ".replay/owned-creation.json", proof)
    gate = json.loads((root / ".replay/empty-local.json").read_text())
    require_owned_creation(root, cfg, gate, container)
    local_endpoint(root)  # Also enforce local status URL, exact project and any nonempty workdir label.

def replay(repo, workdir):
    global ERROR_ROOT, REPLAY_STAGE
    os.umask(0o077)
    require(cli_binary() is not None, "missing CLI")
    prepare(repo, workdir)
    root = root_path(workdir)
    ERROR_ROOT = root
    inputs = prefix_manifest(root)
    tests = sorted(name for name in inputs["files"]
                   if name.startswith("supabase/tests/") and name.endswith(".sql"))
    require(len(tests) == 66, "reviewed HEAD database test membership changed")
    for name, action in (("fresh local gate", empty_local), ("prefix bootstrap", start_prefix),
                         ("observed local ownership", observe_owned_creation), ("bind three constants", bind),
                         ("apply local migration once", apply_local), ("verify body and metadata", verify)):
        REPLAY_STAGE = name
        print("Database replay: " + name, flush=True)
        action(root)
    REPLAY_STAGE = "pgTAP"
    print("Database replay: pgTAP", flush=True)
    output = run([str(cli_binary()[0]), "--workdir", str(root), "test", "db", "--local"])
    put(root / ".replay/pgtap.stdout", output)
    summary = re.search(rb"(?m)^Files=(\d+), Tests=(\d+),", output)
    require(summary is not None and int(summary[1]) == len(tests) and int(summary[2]) > 0 and
            re.search(rb"(?m)^Result: PASS\s*$", output) is not None, "database test summary mismatch")
    prefix_manifest(root)
    complete = {"status": "LOCAL_DERIVED_ENVELOPE_AND_PGTAP_PASS", "head": inputs["head"], "CLI": CLI_VERSION,
          "operatorSHA256": OP_SHA, "bodySHA256": BODY_SHA, "databaseTestFiles": tests,
          "pgTAPFiles": int(summary[1]), "pgTAPTests": int(summary[2]),
          "verifiedSHA256": sha((root / ".replay/verified.json").read_bytes()),
          "pgtapStdoutSHA256": sha(output), "operatorSQLByteExactReplay": False,
          "localACLIsTESTEquivalent": "NOT_CLAIMED"}
    dump(root / ".replay/complete.json", complete)
    export_complete(complete)
    REPLAY_STAGE = "complete"
    print("Database replay: complete; " + str(int(summary[1])) + " files, " + str(int(summary[2])) + " tests", flush=True)

def export_complete(complete):
    if EVIDENCE_ROOT is not None:
        # Explicit projection only: no raw CLI status/output, errors, URLs or keys.
        dump(EVIDENCE_ROOT / "complete.json",
             {"status": "PASS", "stage": "complete", "head": complete["head"],
              "CLI": CLI_VERSION, "operatorSHA256": OP_SHA, "bodySHA256": BODY_SHA,
              "pgTAPFiles": complete["pgTAPFiles"], "pgTAPTests": complete["pgTAPTests"],
              "verifiedSHA256": complete["verifiedSHA256"],
              "pgtapStdoutSHA256": complete["pgtapStdoutSHA256"],
              "operatorSQLByteExactReplay": False, "localACLIsTESTEquivalent": "NOT_CLAIMED"})

def export_error(error):
    if EVIDENCE_ROOT is not None:
        category = ("INTERRUPTED" if isinstance(error, (KeyboardInterrupt, SystemExit)) else
                    "TIMEOUT" if isinstance(error, subprocess.TimeoutExpired) else
                    "IO_ERROR" if isinstance(error, OSError) else
                    "GUARD_REJECTED" if isinstance(error, ValueError) else "UNEXPECTED_ERROR")
        try:
            dump(EVIDENCE_ROOT / "error.json",
                 {"status": "FAIL", "stage": REPLAY_STAGE, "category": category})
        except OSError:
            print("Database replay: closed error evidence could not be written", file=sys.stderr)
        # Never serialize str(error), exception attributes, argv, stdout or stderr.

def main():
    global ERROR_ROOT, EVIDENCE_ROOT
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["run", "prepare", "empty-local", "bind", "apply-local", "verify"])
    parser.add_argument("--workdir", required=True)
    parser.add_argument("--repo")
    parser.add_argument("--evidence-dir")
    args = parser.parse_args()
    if args.mode in ("run", "prepare"):
        require(args.repo is not None, "repo required")
        if args.mode == "run":
            require(args.evidence_dir is not None, "fresh evidence directory required")
            evidence = Path(args.evidence_dir)
            require(evidence.is_absolute() and not evidence.exists() and not evidence.is_symlink(),
                    "evidence directory must be new and absolute")
            evidence.mkdir(mode=0o700)
            EVIDENCE_ROOT = evidence.resolve()
            try:
                replay(args.repo, args.workdir)
            except BaseException as error:
                export_error(error)
                raise
        else:
            prepare(args.repo, args.workdir)
    else:
        root = root_path(args.workdir)
        ERROR_ROOT = root
        {"empty-local": empty_local, "bind": bind, "apply-local": apply_local, "verify": verify}[args.mode](root)

# Filled only when the pinned expected fixture is generated; no runtime override.
EXPECTED_SHA = "1bee30e84056eacb5f993cc33047c7e2e1011ecd79df8f1aee2a3900781f6f10"
if __name__ == "__main__":
    main()
