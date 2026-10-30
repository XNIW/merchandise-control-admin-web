"""Guarded Linux CI replay. Canonical migration files stay unchanged in the checkout."""
import sys
if sys.version_info < (3, 11):
    raise SystemExit("Python 3.11 or newer is required; no automatic installation")
import argparse, hashlib, io, json, os, re, selectors, shutil, signal, socket, subprocess, tarfile, time, tomllib, uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

CLI_VERSION = "2.109.0"
PRICE = "20261027015232_mobile_recovery_checkpoint_price_custom_plan.sql"
TARGET = "20261027143737_mobile_recovery_preflight_metadata_custom_plan.sql"
PRODUCT = "20261028132836_mobile_recovery_checkpoint_product_timestamp_memo.sql"
SHARED = '20261030065236_mobile_recovery_shared_reader_fences.sql'
SHARED_SHA = '5ec447ab99a7694c5c336c5ca76cfbb1a48f568cbb0ad0a97290c4a84099df0c'
SHARED_BODY_MD5 = "7a1e3ec3050743656759432ad448a37b"
PRODUCT_SHA = "f4d51af0863b136695772db3b76d98f8f4f758ef16099bba588317f9c77215d1"
PRODUCT_BODY_MD5 = "60473835c0aa6a53ae16d1c303f3c7bf"
OP_SHA = "9fa653cbd503626ca4e7de2ba957b0cc4274cd604489a9e89998f8e65a397357"
PRICE_SHA = "b1334a1ad5573fe498aa4b66bec07c871ef21c90f8ad1d40ffe6944115f8e262"
BODY_SHA = "09ffea10ac2008db3ac845d00760167ef5737cfe298898ad0bce61583a210f2b"
HERE = Path(__file__).resolve().parent
ERROR_ROOT = None
EVIDENCE_ROOT = None
REPLAY_STAGE = "preparation"
SNAPSHOT_SHA = 'b28a047ea13f00b859e8e650c7b554c58663034488da5400d92dd82c4134a107'
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
    require(sha((root / ".replay/product-operator.sql").read_bytes()) == PRODUCT_SHA, "product operator drift")
    product = root / "supabase/migrations" / PRODUCT
    if product.exists() or product.is_symlink():
        require(not product.is_symlink() and product.resolve().is_relative_to(root), "product target escape")
        binding = json.loads((root / ".replay/product-binding.json").read_text())
        require(sha(product.read_bytes()) == binding["derivedLOCALSHA256"], "bound product target drift")
        declared.add("supabase/migrations/" + PRODUCT)
    require(sha((root / ".replay/shared-reader-operator.sql").read_bytes()) == SHARED_SHA, "shared reader operator drift")
    shared = root / "supabase/migrations" / SHARED
    if shared.exists() or shared.is_symlink():
        require(not shared.is_symlink() and shared.resolve().is_relative_to(root), "shared reader target escape")
        binding = json.loads((root / ".replay/shared-reader-binding.json").read_text())
        require(sha(shared.read_bytes()) == binding["derivedLOCALSHA256"], "bound shared reader target drift")
        declared.add("supabase/migrations/" + SHARED)
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
    product = (repo / "supabase/migrations" / PRODUCT).read_bytes()
    shared = (repo / "supabase/migrations" / SHARED).read_bytes()
    require(sha(shared) == SHARED_SHA and PRODUCT[:14] < SHARED[:14], "shared reader source/order drift")
    require(sha(product) == PRODUCT_SHA and PRICE[:14] < TARGET[:14] < PRODUCT[:14], "product source/order drift")
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
    # Only the four reviewed overlays; every other file came from HEAD, not WIP.
    for name, data in ((PRICE, price), (TARGET, operator), (PRODUCT, product), (SHARED, shared)):
        q = migration_dir / name
        if q.exists():
            require(q.read_bytes() == data, "tracked overlay drift")
        elif name == PRICE:
            put(q, data)
    for name, data in ((TARGET, operator), (PRODUCT, product), (SHARED, shared)):
        target = migration_dir / name
        if target.exists():
            require(target.read_bytes() == data, "withheld file drift")
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
    put(out / ".replay/product-operator.sql", product)
    put(out / ".replay/shared-reader-operator.sql", shared)

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

def derive_product(operator, data, expected, versions, target):
    require(sha(operator) == PRODUCT_SHA, "product operator hash drift")
    require(data["database"] == "postgres" and data["effectiveRole"] == "postgres"
            and data["serverMajor"] == "17", "local product database/operator drift")
    require(data["versions"] == versions + [TARGET[:14]] and data["productLocalStatement"] is None,
            "product requires exactly verified predecessor history")
    require(data["localStatement"] == target.decode().strip().removesuffix(";").strip(),
            "product predecessor ledger drift")
    require(data["authenticatedConfig"] == expected["authenticatedConfig"], "product auth8s drift")
    for name in ("helper", "public"):
        f, e = data["functions"][name], expected["functions"][name]
        require(portable(f) == e["portable"], "product predecessor metadata/ACL drift")
        require(sha(f["body"].encode()) == (BODY_SHA if name == "helper" else e["bodySHA256"]),
                "product predecessor source drift")
    old = b'["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'
    new = b'["authenticated=X/postgres","postgres=X/postgres"]'
    require(operator.count(old) == 1, "product ACL guard token drift")
    result = operator.replace(old, new, 1)
    require(result.count(new) == 1 and result.replace(new, old, 1) == operator,
            "product ACL-only inverse mismatch")
    return result


def bind_product(root):
    m = prefix_manifest(root)
    endpoint = local_endpoint(root)
    verified = json.loads((root / ".replay/verified.json").read_text())
    require(verified["operatorSHA256"] == OP_SHA and verified["bodySHA256"] == BODY_SHA
            and verified["wholeMetadataPreserved"] is True and verified["auth8sPreserved"] is True
            and verified["localLedgerVersion"] == TARGET[:14], "missing verified predecessor")
    data = snapshot(root)
    derived = derive_product((root / ".replay/product-operator.sql").read_bytes(), data,
                             load_expected(), m["versions"], (root / "supabase/migrations" / TARGET).read_bytes())
    dump(root / ".replay/product-before.json", {"endpoint": endpoint, "snapshot": data})
    put(root / "supabase/migrations" / PRODUCT, derived)
    dump(root / ".replay/product-binding.json",
         {"operatorSHA256": PRODUCT_SHA, "derivedLOCALSHA256": sha(derived),
          "inverseSHA256": PRODUCT_SHA, "permittedConstantSlots": 1,
          "onlyChange": "pinned TEST ACL3 guard to qualified LOCAL ACL2; no grants",
          "publicProsrcMD5After": PRODUCT_BODY_MD5, "isOperatorSQLByteExactReplay": False})


def apply_product_local(root):
    m = prefix_manifest(root)
    local_endpoint(root)
    before = json.loads((root / ".replay/product-before.json").read_text())["snapshot"]
    binding = json.loads((root / ".replay/product-binding.json").read_text())
    expected = derive_product((root / ".replay/product-operator.sql").read_bytes(), before,
                             load_expected(), m["versions"], (root / "supabase/migrations" / TARGET).read_bytes())
    require((root / "supabase/migrations" / PRODUCT).read_bytes() == expected
            and sha(expected) == binding["derivedLOCALSHA256"], "derived product file drift")
    claim_apply_attempt(root / ".replay/product-apply-attempt.json",
         {"target": "LOCAL_ONLY", "operatorSHA256": PRODUCT_SHA, "derivedLOCALSHA256": sha(expected),
          "oneAttemptOnly": True, "failureOrUnknown": "STOP_NO_AUTORETRY"})
    output = run(["supabase", "--workdir", str(root), "migration", "up", "--local"])
    put(root / ".replay/product-apply.stdout", output)


def verify_product(root):
    m = prefix_manifest(root)
    endpoint = local_endpoint(root)
    before = json.loads((root / ".replay/product-before.json").read_text())["snapshot"]
    after = snapshot(root)
    derived = (root / "supabase/migrations" / PRODUCT).read_bytes()
    require(after["versions"] == m["versions"] + [TARGET[:14], PRODUCT[:14]], "product local history mismatch")
    require(after["productLocalStatement"] == derived.decode().strip().removesuffix(";").strip()
            and after["localStatement"] == before["localStatement"], "product CLI ledger mismatch")
    require(all(after[key] == before[key] for key in
                ("database", "effectiveRole", "serverMajor", "authenticatedConfig")), "product execution/auth identity changed")
    require(after["functions"]["helper"] == before["functions"]["helper"], "product changed preflight helper")
    old, new = before["functions"]["public"], after["functions"]["public"]
    require(old["metadataText"] == new["metadataText"] and md5(new["body"].encode()) == PRODUCT_BODY_MD5
            and new["definition"] == old["definition"].replace(old["body"], new["body"], 1),
            "product source or whole metadata changed")
    dump(root / ".replay/product-verified.json",
         {"status": "LOCAL_PRODUCT_ACL_ONLY_ENVELOPE_VERIFIED", "endpoint": endpoint,
          "operatorSHA256": PRODUCT_SHA, "derivedLOCALSHA256": sha(derived),
          "publicProsrcMD5After": PRODUCT_BODY_MD5, "wholeMetadataPreserved": True, "auth8sPreserved": True,
          "predecessorLedgerVersion": TARGET[:14], "localLedgerVersion": PRODUCT[:14],
          "CLI": CLI_VERSION, "pgTAP": "NOT_RUN", "isOperatorSQLByteExactReplay": False})


def shared_guard_arrays(operator, tag):
    return re.findall(r'\$' + tag + r'\$(.*?)\$' + tag + r'\$', operator.decode(), re.S)


def derive_shared(operator, data, versions):
    require(sha(operator) == SHARED_SHA, "shared reader operator hash drift")
    require(data["database"] == "postgres" and data["effectiveRole"] == "postgres"
            and data["serverMajor"] == "17" and type(data["ssl"]) is bool, "shared local identity drift")
    require(data["versions"] == versions + [TARGET[:14], PRODUCT[:14]]
            and data["sharedLocalStatements"] is None and data["sharedHelpers"] == {},
            "shared requires exact predecessor and helper absence")
    require(data["authenticatedConfig"] == ["statement_timeout=8s"], "shared auth8s drift")
    guards = shared_guard_arrays(operator, "expected")
    closure = shared_guard_arrays(operator, "closure15expected")
    require(len(guards) == len(closure) == 2 and closure[0] == closure[1], "guard array structure drift")
    functions = data["sharedFunctions"]
    expected_first = json.loads(guards[0])
    expected_closure = json.loads(closure[0])
    require(set(functions) == {x["signature"] for x in expected_first + expected_closure},
            "shared function membership drift")
    for expected in expected_first:
        f = functions[expected["signature"]]
        actual = json.loads(f["metadataText"])
        wanted_acl = [a for a in expected["acl"] if a != "service_role=X/postgres"]
        require(md5(f["body"].encode()) == expected["md5"] and f["names"]["owner"] == expected["owner"]
                and actual["proconfig"] == expected["config"] and sorted(actual["proacl"]) == sorted(wanted_acl)
                and actual["provolatile"] == expected["volatility"]
                and actual["prosecdef"] == expected["securityDefiner"], "shared logical preimage drift")
    for expected in expected_closure:
        f = functions[expected["signature"]]
        metadata = expected["metadata"]
        logical = {k: v for k, v in metadata.items() if k not in OID_KEYS}
        logical.update(schema=expected["signature"].split(".")[0],
                       owner="supabase_auth_admin" if expected["signature"] == "auth.uid()" else "postgres",
                       language="sql" if metadata["prolang"] == "14" else "plpgsql",
                       returnType={"25": "text", "2950": "uuid", "2278": "void", "2249": "record"}[metadata["prorettype"]],
                       argumentTypes=", ".join(expected["signature"].split("(", 1)[1][:-1].split(",")))
        require(md5(f["body"].encode()) == expected["sourceMD5"] and portable(f) == logical,
                "shared full logical closure metadata drift")
    replacements = {}
    for raw in guards:
        changed = json.loads(raw)
        for entry in changed:
            f = functions[entry["signature"]]
            entry["oid"] = str(f["oid"])
            entry["acl"] = json.loads(f["metadataText"])["proacl"]
        replacements["$expected$" + raw + "$expected$"] = "$expected$" + json.dumps(changed, separators=(",", ":")) + "$expected$"
    changed_closure = json.loads(closure[0])
    for entry in changed_closure:
        entry["metadata"] = json.loads(functions[entry["signature"]]["metadataText"])
    replacements["$closure15expected$" + closure[0] + "$closure15expected$"] = "$closure15expected$" + json.dumps(changed_closure, separators=(",", ":")) + "$closure15expected$"
    tls = "(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) IS DISTINCT FROM true"
    require(operator.decode().count(tls) == 2, "shared TLS guard structure drift")
    if not data["ssl"]:
        replacements[tls] = tls.removesuffix("true") + "false"
    result = operator.decode()
    for old, new in replacements.items():
        require(result.count(old) in (1, 2), "shared constant slot drift")
        result = result.replace(old, new)
    inverse = result
    for old, new in reversed(list(replacements.items())):
        require(inverse.count(new) == operator.decode().count(old), "shared inverse slot ambiguity")
        inverse = inverse.replace(new, old)
    require(inverse.encode() == operator, "shared inverse or payload changed")
    return result.encode()


def bind_shared(root):
    inputs = prefix_manifest(root)
    endpoint = local_endpoint(root)
    previous = json.loads((root / ".replay/product-verified.json").read_text())
    require(previous["publicProsrcMD5After"] == PRODUCT_BODY_MD5 and previous["wholeMetadataPreserved"]
            and previous["auth8sPreserved"], "shared predecessor not verified")
    data = snapshot(root)
    derived = derive_shared((root / ".replay/shared-reader-operator.sql").read_bytes(), data, inputs["versions"])
    dump(root / ".replay/shared-reader-before.json", {"endpoint": endpoint, "snapshot": data})
    put(root / "supabase/migrations" / SHARED, derived)
    dump(root / ".replay/shared-reader-binding.json",
         {"operatorSHA256": SHARED_SHA, "derivedLOCALSHA256": sha(derived), "inverseSHA256": SHARED_SHA,
          "onlyChanges": "qualified local OIDs/full physical metadata, existing LOCAL ACL2, observed local TLS guard; no grants or function-body changes",
          "isOperatorSQLByteExactReplay": False})


def apply_shared_local(root):
    inputs = prefix_manifest(root)
    local_endpoint(root)
    before = json.loads((root / ".replay/shared-reader-before.json").read_text())["snapshot"]
    expected = derive_shared((root / ".replay/shared-reader-operator.sql").read_bytes(), before, inputs["versions"])
    require((root / "supabase/migrations" / SHARED).read_bytes() == expected, "derived shared reader drift")
    claim_apply_attempt(root / ".replay/shared-reader-apply-attempt.json",
                        {"target": "LOCAL_ONLY", "operatorSHA256": SHARED_SHA, "derivedLOCALSHA256": sha(expected),
                         "oneAttemptOnly": True, "failureOrUnknown": "STOP_NO_AUTORETRY"})
    output = run(["supabase", "--workdir", str(root), "migration", "up", "--local"])
    put(root / ".replay/shared-reader-apply.stdout", output)


def verify_statement_sequence(statements, operator):
    # The CLI supplies its own SQL split. Match each exact statement in order;
    # only separator semicolons and boundary whitespace may be trimmed.
    require(isinstance(statements, list) and statements, "missing shared migration statements")
    remaining = operator.decode().strip()
    for statement in statements:
        require(isinstance(statement, str) and statement.strip(), "empty shared migration statement")
        statement = statement.strip().removesuffix(";").strip()
        require(remaining.startswith(statement), "shared CLI ledger statement drift")
        remaining = remaining[len(statement):].lstrip()
        if remaining:
            require(remaining.startswith(";"), "shared CLI ledger separator drift")
            remaining = remaining[1:].lstrip()
    require(not remaining, "unaccounted shared migration SQL")


def verify_shared(root):
    inputs = prefix_manifest(root)
    endpoint = local_endpoint(root)
    before = json.loads((root / ".replay/shared-reader-before.json").read_text())["snapshot"]
    after = snapshot(root)
    require(after["versions"] == inputs["versions"] + [TARGET[:14], PRODUCT[:14], SHARED[:14]],
            "shared local history mismatch")
    verify_statement_sequence(after["sharedLocalStatements"], (root / "supabase/migrations" / SHARED).read_bytes())
    require(all(after[k] == before[k] for k in ["database", "effectiveRole", "serverMajor", "ssl", "authenticatedConfig", "localStatement", "productLocalStatement"]),
            "shared identity/auth/predecessor ledger drift")
    for signature, old in before["sharedFunctions"].items():
        new = after["sharedFunctions"][signature]
        if signature == "public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)":
            expected = old["body"].replace("app_private.resolve_shop_sync_recovery_scope(", "app_private.resolve_shop_sync_recovery_read_scope_v1(").replace("app_private.acquire_sync_event_scope_fence_v1(", "app_private.acquire_sync_event_scope_read_fence_v1(")
            require(md5(new["body"].encode()) == SHARED_BODY_MD5 and new["body"] == expected
                    and new["metadataText"] == old["metadataText"] and new["names"] == old["names"]
                    and new["definition"] == old["definition"].replace(old["body"], expected, 1), "shared CP source/metadata drift")
        else:
            require(new == old, "shared changed original function")
    wanted = {"app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)": "21a2f0eeef545f6aebb05f6c2757edc2",
              "app_private.lock_catalog_scope_pair_read_v1(uuid,uuid)": "84cce948d3718e54ab946c81b6a400aa",
              "app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text)": "334ed6616a382e7c9362a3e4efad70fc"}
    require(set(after["sharedHelpers"]) == set(wanted), "shared helper membership drift")
    for signature, digest in wanted.items():
        f = after["sharedHelpers"][signature]; metadata = json.loads(f["metadataText"])
        require(md5(f["body"].encode()) == digest and f["names"]["owner"] == "postgres"
                and metadata["proacl"] == ["postgres=X/postgres"] and metadata["prosecdef"]
                and metadata["provolatile"] == "v"
                and metadata["proconfig"] == (["search_path=pg_catalog"] if "lock_catalog_scope_pair_read" in signature
                    else ["search_path=public, app_private, pg_temp"]), "shared helper source/ACL/config drift")
    dump(root / ".replay/shared-reader-verified.json",
         {"status": "LOCAL_SHARED_READER_ENVELOPE_VERIFIED", "endpoint": endpoint, "operatorSHA256": SHARED_SHA,
          "derivedLOCALSHA256": sha((root / "supabase/migrations" / SHARED).read_bytes()),
          "publicProsrcMD5After": SHARED_BODY_MD5, "wholeMetadataPreserved": True, "auth8sPreserved": True,
          "originalResolverAndWritersUnchanged": True, "privateHelperCount": 3,
          "localLedgerVersion": SHARED[:14], "pgTAP": "NOT_RUN", "concurrency": "NOT_RUN"})

class _PairChild:
    """One owned psql/docker process; buffers never escape as raw output."""
    def __init__(self, side, argv, selector, owners):
        import os
        self.side = side; self.rows = []; self.markers = set(); self.sqlstates = []
        self.raw = bytearray(); self.stderr = bytearray(); self.byte_count = 0
        self.tls = False; self.forcedLocalTermination = False
        self.process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, start_new_session=True)
        owners.append(self)
        for stream, kind in ((self.process.stdout, "out"), (self.process.stderr, "err")):
            os.set_blocking(stream.fileno(), False); selector.register(stream, 1, (self, kind))
    def send(self, text):
        self.process.stdin.write(text.encode()); self.process.stdin.flush()
    def accept(self, kind, chunk):
        self.byte_count += len(chunk)
        if self.byte_count > 49152:
            raise RuntimeError("OUTPUT_BOUND")
        if kind == "err":
            self.stderr.extend(chunk); return
        self.raw.extend(chunk)
        while b"\n" in self.raw:
            line, _, remainder = self.raw.partition(b"\n"); self.raw = bytearray(remainder)
            if line.startswith(b"PAIRJSON:"):
                value = json.loads(line[len(b"PAIRJSON:"):])
                if value.get("side") != self.side:
                    raise RuntimeError("DEMULTIPLEX")
                self.rows.append(value)
            elif line.startswith(b"PAIRSQLSTATE:"):
                match = re.fullmatch(rb"PAIRSQLSTATE:\s+([0-9A-Z]{5})\s*", line)
                if not match: raise RuntimeError("SQLSTATE_FRAME")
                self.sqlstates.append(match.group(1).decode())
            elif line.startswith(b"__PAIR_") or line.startswith(b"__PASSFILE_"):
                self.markers.add(line.decode())
            elif b"SSL connection (protocol: TLSv1." in line:
                self.tls = bool(re.search(rb"protocol: TLSv1\.[23],", line))
            # Other psql connection info/empty lines are deliberately suppressed.

SCOPE='00000000-0000-4000-8000-000000145701';OTHER='00000000-0000-4000-8000-000000145702'
OWNER='00000000-0000-4000-8000-000000145700';OTHER_OWNER='00000000-0000-4000-8000-000000145703'

def qualify_shared_locks(snapshot,identities,expected_readers,waiting):
    assert snapshot['side']=='observer' and snapshot['kind']=='SNAPSHOT'
    key=snapshot['key'];assert set(key)=={'classid','objid','objsubid'} and key['objsubid']==2
    rows={r['side']:r for r in snapshot['rows']}
    for side in expected_readers+['writer']:
        row=rows[side];expected=identities[side]
        assert all(row[k]==expected[k] for k in ['pid','backendStart','xactStart'])
        mode='ShareLock' if side in expected_readers else 'ExclusiveLock'
        locks=[l for l in row['locks'] if all(l[k]==key[k] for k in key) and l['mode']==mode]
        assert len(locks)==1
        assert locks[0]['granted'] is (side in expected_readers or not waiting)
    for side in expected_readers:
        for wanted in snapshot['readKeys']:
            matches=[l for l in rows[side]['locks'] if all(l[k]==wanted[k] for k in wanted) and l['mode']=='ShareLock' and l['granted']]
            assert len(matches)==1,'COMBINED_READ_LOCK_MISSING'
    writer=rows['writer']
    if waiting:
        assert writer['waitEventType']=='Lock' and writer['waitEvent']=='advisory'
        assert set(writer['blockingPIDs'])=={identities[s]['pid'] for s in expected_readers}
    else:assert not writer['blockingPIDs']
    return True

def shared_reader_matrix(root,domain):
    require(sys.flags.optimize == 0, "matrix assertions require ordinary Python")
    out = root / (".replay/shared-reader-concurrency-" + domain + ".json")
    assert domain in {'catalog','event'}
    focus_namespace='catalog_union_scope' if domain=='catalog' else 'sync_event_scope_fence_v1'
    focus_value=OWNER if domain=='catalog' else 'shop:'+SCOPE
    writer_call=(f"SELECT app_private.lock_catalog_scope_pair_v1('{SCOPE}'::uuid,'{OWNER}'::uuid);\n" if domain=='catalog' else f"SELECT app_private.acquire_sync_event_scope_fence_v1('{OWNER}'::uuid,'{SCOPE}'::uuid);\n")
    other_call=(f"SELECT app_private.lock_catalog_scope_pair_v1('{OTHER}'::uuid,'{OTHER_OWNER}'::uuid);\n" if domain=='catalog' else f"SELECT app_private.acquire_sync_event_scope_fence_v1('{OTHER_OWNER}'::uuid,'{OTHER}'::uuid);\n")
    operator = (root / ".replay/shared-reader-operator.sql").read_bytes()
    require(sha(operator) == SHARED_SHA, "matrix source operator drift")
    def helper_definition(name):
        text = operator.decode(); start = text.index("CREATE FUNCTION app_private." + name + "(")
        end = text.index("REVOKE ALL ON FUNCTION app_private." + name + "(", start)
        end = text.index(";", end) + 1
        return (text[start:end] + "\n").encode()
    helper = helper_definition("acquire_sync_event_scope_read_fence_v1")
    catalog = helper_definition("lock_catalog_scope_pair_read_v1")
    require(sha(helper) == "b9e8e8b49f87bb07886a1c42f083d08552c9dd48f1e42586b067d0117ca3f5f3"
            and sha(catalog) == "bae54f62e337da34596467fad93593824ddbdedfc1ae74537a4cab1ff1103645", "matrix helper body drift")
    endpoint = local_endpoint(root)
    argv = ["docker", "exec", "-i", endpoint["containerID"], "/nix/var/nix/profiles/default/bin/psql",
            "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate", "-U", "postgres", "-d", "postgres"]
    owned=[];sel=selectors.DefaultSelector();deadline=time.monotonic()+30;children={};identities={};report={'status':'FAIL_UNFINISHED','remoteTEST':False,'businessDML':False,'publicFunctionChanged':False,'helperLevelOnly':True,'combinedCatalogAndEventReaders':True,'originalWriterDomain':domain,'snapshots':[]}
    def pump(limit):
        assert time.monotonic()<min(limit,deadline),'LOCAL_BOUND'
        for key,_ in sel.select(.025):
            child,kind=key.data;chunk=os.read(key.fileobj.fileno(),65536)
            if chunk:child.accept(kind,chunk)
            else:sel.unregister(key.fileobj)
    def frame(child,kind,sequence=None):
        limit=min(time.monotonic()+3,deadline)
        while True:
            rows=[r for r in child.rows if r.get('kind')==kind and (sequence is None or r.get('sequence')==sequence)]
            if rows:assert len(rows)==1;return rows[0]
            assert child.process.poll() is None,'EARLY_CLIENT_EXIT'
            pump(limit)
    def start(side):
        c=_PairChild(side,argv,sel,owned);children[side]=c
        c.send("BEGIN; SET LOCAL statement_timeout='8s'; SET LOCAL search_path=pg_catalog;\n")
        return c
    def emit(side,kind,extra=''):
        return "SELECT 'PAIRJSON:'||jsonb_build_object('side','"+side+"','kind','"+kind+"','pid',pid,'backendStart',backend_start,'xactStart',xact_start"+extra+")::text FROM pg_stat_activity WHERE pid=pg_backend_pid();\n"
    def stop(c):
        if c.process.poll() is None:
            c.send('ROLLBACK;\n\\echo __PAIR_'+c.side.upper()+'_ROLLBACK__\n\\quit\n');c.process.stdin.close()
        limit=min(time.monotonic()+9,deadline)
        while c.process.poll() is None:pump(limit)
        # Drain final output without blocking beyond the original global bound.
        for _ in range(3):
            if not sel.get_map():break
            pump(min(time.monotonic()+.2,deadline))
        assert c.process.returncode==0 and '__PAIR_'+c.side.upper()+'_ROLLBACK__' in c.markers,'ROLLBACK_NOT_PROVEN'
    def snapshot(seq,readers,waiting):
        ids=','.join(str(identities[s]['pid']) for s in ['r1','r2','writer'])
        cases='CASE a.pid '+' '.join('WHEN '+str(identities[s]['pid'])+" THEN '"+s+"'" for s in ['r1','r2','writer'])+' END'
        sql=f"""SELECT pg_stat_clear_snapshot();
SELECT 'PAIRJSON:'||jsonb_build_object('side','observer','kind','SNAPSHOT','sequence',{seq},'at',clock_timestamp(),
'key',jsonb_build_object('classid',(hashtext('{focus_namespace}')::bigint&4294967295::bigint),'objid',(hashtext('{focus_value}')::bigint&4294967295::bigint),'objsubid',2),
'readKeys',jsonb_build_array(
 jsonb_build_object('classid',(hashtext('catalog_union_scope')::bigint&4294967295::bigint),'objid',(hashtext('{OWNER}')::bigint&4294967295::bigint),'objsubid',2),
 jsonb_build_object('classid',(hashtext('catalog_union_scope')::bigint&4294967295::bigint),'objid',(hashtext('{SCOPE}')::bigint&4294967295::bigint),'objsubid',2),
 jsonb_build_object('classid',(hashtext('sync_event_scope_fence_v1')::bigint&4294967295::bigint),'objid',(hashtext('shop:{SCOPE}')::bigint&4294967295::bigint),'objsubid',2)),
'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('side',{cases},'pid',a.pid,'backendStart',a.backend_start,'xactStart',a.xact_start,'waitEventType',a.wait_event_type,'waitEvent',a.wait_event,'blockingPIDs',pg_blocking_pids(a.pid),
'locks',coalesce((SELECT jsonb_agg(jsonb_build_object('mode',l.mode,'granted',l.granted,'classid',l.classid::bigint,'objid',l.objid::bigint,'objsubid',l.objsubid)) FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='advisory'),'[]'::jsonb))) FROM pg_stat_activity a WHERE a.pid IN ({ids})),'[]'::jsonb))::text;
"""
        children['observer'].send(sql);s=frame(children['observer'],'SNAPSHOT',seq);report['snapshots'].append(s);qualify_shared_locks(s,identities,readers,waiting)
    try:
        observer=start('observer')
        observer.send("DO $g$ BEGIN IF current_database()<>'postgres' OR current_user<>'postgres' OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure)<>'0199f8030d3bd207ac27527ed9a52862' OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.sync_event_scope_fence_key_v1(uuid,uuid)'::regprocedure)<>'5c56ddfa4e479e85a9158114722b14f8' OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure)<>'e7e8c0b08519a53345e9ca583e484481' OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.resolve_shop_sync_recovery_scope(uuid,text)'::regprocedure)<>'0f47ec89de6f5ea847548e55721d7f54' THEN RAISE EXCEPTION 'LOCAL_SOURCE_MISMATCH';END IF;END;$g$;\n"+emit('observer','READY',",'writerMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure),'checkpointMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure),'catalogWriterMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure),'resolverMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.resolve_shop_sync_recovery_scope(uuid,text)'::regprocedure)"))
        before=frame(observer,'READY')
        require(before['checkpointMD5'] == SHARED_BODY_MD5, 'matrix candidate CP drift')
        temporary=helper.decode().replace('app_private.acquire_sync_event_scope_read_fence_v1','pg_temp.acquire_sync_event_scope_read_fence_v1')+catalog.decode().replace('app_private.lock_catalog_scope_pair_read_v1','pg_temp.lock_catalog_scope_pair_read_v1')
        for side in ['r1','r2']:
            c=start(side);c.send(temporary+f"SELECT pg_temp.lock_catalog_scope_pair_read_v1('{SCOPE}'::uuid,'{OWNER}'::uuid);\nSELECT pg_temp.acquire_sync_event_scope_read_fence_v1('{OWNER}'::uuid,'{SCOPE}'::uuid);\n"+emit(side,'READY',",'noWriterWitness',nullif(current_setting('app_private.sync_event_scope_fence',true),'') IS NULL"))
            identities[side]=frame(c,'READY');assert identities[side]['noWriterWitness']
        other=start('other');other.send(other_call+emit('other','READY'))
        frame(other,'READY');stop(other);report['differentScopeWriterCompleted']=True
        w=start('writer');w.send(emit('writer','PHASE')+writer_call+emit('writer','READY'))
        identities['writer']=frame(w,'PHASE')
        snapshot(1,['r1','r2'],True)
        stop(children['r1']);snapshot(2,['r2'],True)
        stop(children['r2']);frame(w,'READY');snapshot(3,[],False)
        observer.send(emit('observer','POSTCHECK',",'writerMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure),'checkpointMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure),'catalogWriterMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure),'resolverMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.resolve_shop_sync_recovery_scope(uuid,text)'::regprocedure)"))
        after=frame(observer,'POSTCHECK');assert before['writerMD5']==after['writerMD5'] and before['checkpointMD5']==after['checkpointMD5'] and before['catalogWriterMD5']==after['catalogWriterMD5'] and before['resolverMD5']==after['resolverMD5']
        report['functionBeforeAfter']={'before':before,'after':after}
        report.update(status='PASS_LOCAL_COMBINED_READERS_ORIGINAL_WRITER_FENCE_MATRIX',noWriterWitness=True,originalWriterUnchanged=True,readers=identities,actualCPPerformanceMeasured=False)
    except BaseException as e:
        report.update(status='FAIL_LOCAL_LOCK_REGRESSION',errorClass=type(e).__name__)
    finally:
        cleanup=[]
        for side in ['r1','r2','other','writer','observer']:
            c=children.get(side)
            if not c:continue
            try:stop(c);ok=True
            except BaseException:ok=False
            if c.process.poll() is None:
                try:os.killpg(c.process.pid,15);c.process.wait(timeout=2)
                except BaseException:pass
            cleanup.append(dict(side=side,pid=c.process.pid,exit=c.process.poll(),rollbackAndNaturalExit=ok,rows=c.rows,sqlstates=c.sqlstates,stderr=c.stderr.decode(errors='replace')))
        sel.close();report['cleanup']=cleanup
        if not all(x['rollbackAndNaturalExit'] for x in cleanup):report['diagnosticBeforeCleanup']=report['status'];report['status']='FAIL_LOCAL_TRANSACTION_ENDING_UNCONFIRMED'
        assert not out.exists();out.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(status=report['status'],receipt=str(out))))
    return 0 if report['status'].startswith('PASS_') else 2


def shared_reader_matrices(root):
    receipts = {}
    for domain in ("catalog", "event"):
        require(shared_reader_matrix(root, domain) == 0, "shared reader matrix failed; no retry")
        p = root / (".replay/shared-reader-concurrency-" + domain + ".json")
        result = json.loads(p.read_text())
        require(result["noWriterWitness"] and result["originalWriterUnchanged"]
                and all(x["rollbackAndNaturalExit"] and x["exit"] == 0 for x in result["cleanup"]),
                "matrix ownership/rollback drift")
        receipts[domain] = {"status": result["status"], "receiptSHA256": sha(p.read_bytes()), "snapshots": 3}
    dump(root / ".replay/shared-reader-matrices.json", receipts)


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
                         ("apply local migration once", apply_local), ("verify body and metadata", verify),
                         ("bind product ACL constant", bind_product), ("apply product migration once", apply_product_local),
                         ("verify product body metadata and ledger", verify_product),
                         ("bind shared reader local metadata", bind_shared), ("apply shared reader migration once", apply_shared_local),
                         ("verify shared reader body metadata and ledger", verify_shared),
                         ("shared reader original writer matrices", shared_reader_matrices)):
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
          "verifiedSHA256": sha((root / ".replay/product-verified.json").read_bytes()),
          "productMigrationSHA256": PRODUCT_SHA, "productPublicProsrcMD5": PRODUCT_BODY_MD5,
          "sharedReaderMigrationSHA256": SHARED_SHA, "sharedReaderPublicProsrcMD5": SHARED_BODY_MD5,
          "sharedReaderVerifiedSHA256": sha((root / ".replay/shared-reader-verified.json").read_bytes()),
          "sharedReaderMatricesSHA256": sha((root / ".replay/shared-reader-matrices.json").read_bytes()),
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
              "productMigrationSHA256": complete["productMigrationSHA256"],
              "productPublicProsrcMD5": complete["productPublicProsrcMD5"],
              "sharedReaderMigrationSHA256": complete["sharedReaderMigrationSHA256"],
              "sharedReaderPublicProsrcMD5": complete["sharedReaderPublicProsrcMD5"],
              "sharedReaderVerifiedSHA256": complete["sharedReaderVerifiedSHA256"],
              "sharedReaderMatricesSHA256": complete["sharedReaderMatricesSHA256"],
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
    parser.add_argument("mode", choices=["run", "prepare", "empty-local", "bind", "apply-local", "verify",
                                        "bind-product", "apply-product-local", "verify-product",
                                        "bind-shared", "apply-shared-local", "verify-shared"])
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
        {"empty-local": empty_local, "bind": bind, "apply-local": apply_local, "verify": verify,
         "bind-product": bind_product, "apply-product-local": apply_product_local, "verify-product": verify_product,
         "bind-shared": bind_shared, "apply-shared-local": apply_shared_local, "verify-shared": verify_shared}[args.mode](root)

# Filled only when the pinned expected fixture is generated; no runtime override.
EXPECTED_SHA = "1bee30e84056eacb5f993cc33047c7e2e1011ecd79df8f1aee2a3900781f6f10"
if __name__ == "__main__":
    main()
