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
SHARED = '20261104224833_mobile_recovery_shared_reader_fences.sql'
MOBILE_SALES = '20261105220929_mobile_sales_read_v1.sql'
MOBILE_SALES_SHA = '4111c78b85dd7e16160eaef8d73d2d9ae872c1caa14770e4864e06c25c092c1f'
NATIVE_EMPTY = '20261108051044_asus_019_native_empty_catalog_scope.sql'
NATIVE_EMPTY_SHA = 'af69667d6e8e9988a833c4cb2b818c4378061cbc6869c4821b29aa5e64e379ce'
NATIVE_EMPTY_BODY_MD5 = '9622c4d3a4c793a7803d730b8a8c51d4'
REVIEWED_EXTENSIONS = {
    '20261110022056_asus019_staff_mobile_device_reads.sql': {'sha256':'336bb7611b21235ea3a6cde9e7c8283e8b94c5c2edfadfee6eca5f3e9cb8891e','additionalAssertions':25,'testFile':'supabase/tests/asus019_staff_mobile_operations_read.sql'},
    '20261110020325_asus019_staff_operations_read.sql': {'sha256':'2b4c17b47f5f27e767224204f4d3fd694afb835903bdb09baa9ad8968b909e86','additionalAssertions':31,'testFile':'supabase/tests/asus019_staff_operations_read.sql'},
    '20261110012505_asus019_staff_operational_reads.sql': {
        'sha256': '571ea7d0a7628e8f9b10e0b6fd8ec9005fb6974ce1e5538456eee954e24217ab',
        'additionalAssertions': 31,
        'testFile': 'supabase/tests/asus019_staff_profile_read.sql',
    },
}
MOBILE_SALES_BODY_MD5 = '42bb90a0d49faa42e78558f9c610944c'
SHARED_SHA = '6c6555304418c337da74c5be7549677d5604ea3d5e4e4ed7ba7d8941c6b29134'
SHARED_BODY_MD5 = "7a1e3ec3050743656759432ad448a37b"
PRODUCT_SHA = 'a6c249e7f0f1f453d56509152f7db23326f6585f5ef6a719d1d1ea18365e5e92'
PRODUCT_BODY_MD5 = "60473835c0aa6a53ae16d1c303f3c7bf"
OP_SHA = '8ec6a4c07750ef8e55bc7527887159906fbd7e91d002445886db859692fd70ff'
PRICE_SHA = "b1334a1ad5573fe498aa4b66bec07c871ef21c90f8ad1d40ffe6944115f8e262"
BODY_SHA = "09ffea10ac2008db3ac845d00760167ef5737cfe298898ad0bce61583a210f2b"
HERE = Path(__file__).resolve().parent
ERROR_ROOT = None
EVIDENCE_ROOT = None
REPLAY_STAGE = "preparation"
PREFIX_START_FAILURE_CATEGORY = None
PREFIX_START_CATEGORIES = frozenset({
    "PREFIX_START_TIMEOUT", "PREFIX_IMAGE_RATE_LIMIT", "PREFIX_IMAGE_PULL_FAILED",
    "PREFIX_CONTAINER_HEALTH_FAILED", "PREFIX_LOCAL_CONNECTION_FAILED",
    "PREFIX_BOOTSTRAP_MIGRATION_FAILED", "PREFIX_START_FAILED",
})
LOCAL_PROFILE = "ci"
PROFILE_DB_PORTS = {"ci":54322, "task146-host":65422}
WRITER_BODY_HASHES = {'app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)': '8bc0089c0f2d0fbccd3286a4022d90ea', 'app_private.lock_catalog_scope_pair_v1(uuid,uuid)': '394bef66b0f19c3e64ae82e48d7187a3'}
LOCAL_TEST_OVERLAYS = {"supabase/tests/cross_platform_sync_recovery_contract.sql": "5f2f2d4435f90e3e3e2353e0341c782dcba14aacbba73f59b3f177b6613f1343"}
SNAPSHOT_SHA = '147721aac551b6ac06bb782a986a83b83f7173b8b751b15066ebe3cb3f7c8388'

def require(ok, message):
    if not ok:
        raise ValueError(message)


def prefix_start_failure_category(stderr, timed_out):
    # Project only a closed category. Never publish native output, exception
    # messages, paths, arguments or credentials from the private startup log.
    if timed_out:
        return "PREFIX_START_TIMEOUT"
    text = stderr[-65536:].decode("utf-8", errors="replace").lower()
    for phrases, category in (
        (("toomanyrequests", "too many requests", "429 too many", "status code: 429"), "PREFIX_IMAGE_RATE_LIMIT"),
        (("failed to pull", "error pulling image", "failed to resolve reference", "manifest unknown"), "PREFIX_IMAGE_PULL_FAILED"),
        (("unhealthy", "container is not healthy", "failed to start docker container", "failed to inspect docker container"), "PREFIX_CONTAINER_HEALTH_FAILED"),
        (("connection refused",), "PREFIX_LOCAL_CONNECTION_FAILED"),
        (("failed to apply migration", "error applying migration", "migration failed"), "PREFIX_BOOTSTRAP_MIGRATION_FAILED"),
    ):
        if any(phrase in text for phrase in phrases):
            return category
    return "PREFIX_START_FAILED"

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
        if REPLAY_STAGE == "pgTAP" and EVIDENCE_ROOT is not None and ERROR_ROOT is not None:
            known = {p.name for p in (ERROR_ROOT / "supabase/tests").glob("*.sql")}
            dump(EVIDENCE_ROOT / "pgtap-diagnostics.json", closed_pgtap_diagnostics(r.stdout, r.stderr, known))
        raise ValueError("command failed; private evidence retained; no retry")
    return r.stdout


def closed_pgtap_diagnostics(stdout, stderr, known):
    # Only repository test basenames, line/assertion numbers and closed categories.
    # No exception text, SQL, expected/actual values, paths or CLI output is exported.
    source = (stdout + b'\n' + stderr).decode('utf-8', errors='replace')
    locations = set()
    for match in re.finditer(r'psql:[^\r\n]*?([A-Za-z0-9_-]+\.sql):(\d+):\s+ERROR:', source):
        if match[1] in known:
            locations.add((match[1], int(match[2])))
    failures = sorted({int(m[1]) for m in re.finditer(r'(?m)^\s*(?:#\s*)?not ok\s+(\d+)\b', source)})
    files = sorted({name for name in known if re.search(r'\b' + re.escape(name) + r'\b', source)})
    categories = [category for pattern, category in (
        (r'violates check constraint', 'CHECK_CONSTRAINT'), (r'violates not-null constraint', 'NOT_NULL_CONSTRAINT'),
        (r'duplicate key value', 'UNIQUE_CONSTRAINT'), (r'column .+ does not exist', 'MISSING_COLUMN'),
        (r'function .+ does not exist', 'MISSING_FUNCTION'), (r'permission denied', 'PERMISSION_DENIED'),
        (r'syntax error', 'SYNTAX_ERROR'), (r'Bad plan|planned \d+ tests but ran', 'TEST_PLAN_MISMATCH'),
    ) if re.search(pattern, source, re.I)]
    return {'status':'FAIL', 'testFiles':files, 'sqlLocations':[{'file':name,'line':line} for name,line in sorted(locations)],
            'failedAssertionNumbers':failures, 'categories':categories or ['UNCLASSIFIED_PGTAP_FAILURE']}

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
    require(LOCAL_PROFILE in PROFILE_DB_PORTS and t["db"]["port"] == PROFILE_DB_PORTS[LOCAL_PROFILE], "named profile DB port drift")
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
    require(m["profile"] == LOCAL_PROFILE, "named profile manifest drift")
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
    require(sha((root / ".replay/mobile-sales-operator.sql").read_bytes()) == MOBILE_SALES_SHA,
            "mobile sales operator drift")
    mobile = root / "supabase/migrations" / MOBILE_SALES
    if mobile.exists() or mobile.is_symlink():
        require(not mobile.is_symlink() and mobile.is_file() and mobile.resolve().is_relative_to(root),
                "mobile sales target escape")
        binding = json.loads((root / ".replay/mobile-sales-binding.json").read_text())
        require(sha(mobile.read_bytes()) == binding["derivedLOCALSHA256"] == MOBILE_SALES_SHA,
                "bound mobile sales target drift")
        declared.add("supabase/migrations/" + MOBILE_SALES)
    require(sha((root / ".replay/native-empty-operator.sql").read_bytes()) == NATIVE_EMPTY_SHA,
            "native empty scope operator drift")
    native = root / "supabase/migrations" / NATIVE_EMPTY
    if native.exists() or native.is_symlink():
        require(not native.is_symlink() and native.is_file() and native.resolve().is_relative_to(root),
                "native empty scope target escape")
        binding = json.loads((root / ".replay/native-empty-binding.json").read_text())
        require(sha(native.read_bytes()) == binding["derivedLOCALSHA256"] == NATIVE_EMPTY_SHA,
                "bound native empty scope target drift")
        declared.add("supabase/migrations/" + NATIVE_EMPTY)
    for name, spec in REVIEWED_EXTENSIONS.items():
        canonical = root / ".replay" / name
        require(not canonical.is_symlink() and sha(canonical.read_bytes()) == spec['sha256'],
                "reviewed extension source drift")
        applied = root / "supabase/migrations" / name
        if applied.exists() or applied.is_symlink():
            require(not applied.is_symlink() and applied.is_file() and applied.resolve().is_relative_to(root)
                    and sha(applied.read_bytes()) == spec['sha256'], "reviewed extension target drift")
            declared.add("supabase/migrations/" + name)
    observed = {str(p.relative_to(root)) for p in (root / "supabase/migrations").rglob("*")
                if p.is_file() or p.is_symlink()}
    require(observed == declared, "extra or missing migration input")
    return m

def migration_version(name):
    match = re.fullmatch(r"([0-9]+)_[A-Za-z0-9_-]+\.sql", name)
    require(match is not None, "unknown migration filename")
    return match.group(1)

def local_config_bytes(data, project):
    before = tomllib.loads(data.decode())
    require(re.fullmatch(r"r4-ci-preflight-[0-9a-f]{12}", project) is not None, "project locator shape")
    changed, count = re.subn(r'(?m)^([ \t]*project_id[ \t]*=[ \t]*")([^"\r\n]*)(")',
                             lambda match: match[1] + project + match[3], data.decode())
    require(count == 1, "project locator shape")
    inverse = changed.replace('project_id = "' + project + '"', 'project_id = "' + before["project_id"] + '"', 1)
    require(inverse.encode() == data, "config changed beyond project locator")
    require(before["db"]["port"] == 54322, "CI HEAD DB port drift")
    if LOCAL_PROFILE == "task146-host":
        mapping = {("api", "port"): (54321, 65421), ("db", "port"): (54322, 65422),
          ("db", "shadow_port"): (54320, 65420), ("db.pooler", "port"): (54329, 65429),
          ("studio", "port"): (54323, 65423), ("inbucket", "port"): (54324, 65424),
          ("analytics", "port"): (54327, 65427), ("edge_runtime", "inspector_port"): (8083, 18083)}
        lines = changed.splitlines(keepends=True); section = ""; seen = set(); original_lines = list(lines)
        for i, line in enumerate(lines):
            header = re.fullmatch(r"\s*\[([^]]+)\]\s*(?:#.*)?(?:\n)?", line)
            if header: section = header[1]
            setting = re.match(r"^(\s*)([a-z_]+)(\s*=\s*)([0-9]+)([^\r\n]*)(\r?\n)?$", line)
            if setting and (section, setting[2]) in mapping:
                key = (section, setting[2]); old, new = mapping[key]
                require(int(setting[4]) == old and key not in seen, "host profile port preimage drift")
                lines[i] = setting[1] + setting[2] + setting[3] + str(new) + setting[5] + (setting[6] or "")
                seen.add(key)
        require(seen == set(mapping), "host profile port membership drift")
        changed = "".join(lines)
        # Undo only the eight exact line slots, then the project slot; bytes must match HEAD.
        for i in range(len(lines)):
            if lines[i] != original_lines[i]: lines[i] = original_lines[i]
        require("".join(lines).replace('project_id = "' + project + '"', 'project_id = "' + before["project_id"] + '"', 1).encode() == data,
                "host profile inverse changed non-port bytes")
    else: require(LOCAL_PROFILE == "ci", "unknown local profile")
    return changed.encode()

def prepare(repo, workdir):
    repo = Path(repo).resolve()
    out = Path(workdir)
    require(not out.exists(), "workdir must be new")
    operator = (repo / "supabase/migrations" / TARGET).read_bytes()
    price = (repo / "supabase/migrations" / PRICE).read_bytes()
    product = (repo / "supabase/migrations" / PRODUCT).read_bytes()
    shared = (repo / "supabase/migrations" / SHARED).read_bytes()
    mobile = (repo / "supabase/migrations" / MOBILE_SALES).read_bytes()
    native = (repo / "supabase/migrations" / NATIVE_EMPTY).read_bytes()
    extensions = {}
    previous = NATIVE_EMPTY[:14]
    for name, spec in sorted(REVIEWED_EXTENSIONS.items()):
        data = (repo / 'supabase/migrations' / name).read_bytes()
        require(migration_version(name) > previous and sha(data) == spec['sha256'],
                'reviewed extension source/order drift')
        previous = name[:14]
        extensions[name] = data
    require(sha(native) == NATIVE_EMPTY_SHA and MOBILE_SALES[:14] < NATIVE_EMPTY[:14],
            "native empty scope source/order drift")
    require(sha(mobile) == MOBILE_SALES_SHA and SHARED[:14] < MOBILE_SALES[:14],
            "mobile sales source/order drift")
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
    for relative, digest in LOCAL_TEST_OVERLAYS.items():
        candidate = (repo / relative).read_bytes()
        require(sha(candidate) == digest, "reviewed test overlay drift")
        (out / relative).write_bytes(candidate)
    migration_dir = out / "supabase/migrations"
    # Only the four A1 overlays; B3 and all other inputs come from HEAD.
    for name, data in ((PRICE, price), (TARGET, operator), (PRODUCT, product), (SHARED, shared)):
        q = migration_dir / name
        if q.exists():
            require(q.read_bytes() == data, "tracked overlay drift")
        elif name == PRICE:
            put(q, data)
    require((migration_dir / MOBILE_SALES).is_file()
            and (migration_dir / MOBILE_SALES).read_bytes() == mobile, "mobile sales not in committed HEAD")
    for name, data in ((TARGET, operator), (PRODUCT, product), (SHARED, shared), (MOBILE_SALES, mobile), (NATIVE_EMPTY, native)):
        target = migration_dir / name
        if target.exists():
            require(target.read_bytes() == data, "withheld file drift")
            target.unlink()  # New owned copy only; source/ledger are never modified.
    for name, data in extensions.items():
        target = migration_dir / name
        require(target.is_file() and target.read_bytes() == data, 'extension must be committed byte-exact')
        target.unlink()  # Only this new owned replay copy; preserve the checked-out migration.
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
          "configOriginalSHA256": sha(original), "onlyConfigChange": "named profile exact project/port slots only", "profile": LOCAL_PROFILE,
          "runnerSHA256": sha(Path(__file__).read_bytes()), "testOverlays": LOCAL_TEST_OVERLAYS})
    put(out / ".replay/operator.sql", operator)
    put(out / ".replay/product-operator.sql", product)
    put(out / ".replay/shared-reader-operator.sql", shared)
    put(out / ".replay/mobile-sales-operator.sql", mobile)
    put(out / ".replay/native-empty-operator.sql", native)
    for name, data in extensions.items():
        put(out / '.replay' / name, data)

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
            PROFILE_DB_PORTS[LOCAL_PROFILE] and container["health"] == "healthy" and
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

def shared_reader_matrix(root,domain,receipt_dir=None):
    require(sys.flags.optimize == 0, "matrix assertions require ordinary Python")
    out = (receipt_dir or root/".replay") / ("shared-reader-concurrency-" + domain + ".json")
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
        # pg_stat_activity, pg_locks and blocking PID reads can straddle the
        # writer entering its wait. Retain every attempt and accept only the
        # complete original lock/wait/blocker witness within the same 3s bound.
        limit=min(time.monotonic()+3,deadline);attempt=0
        while True:
            assert time.monotonic()<limit,'COMPLETE_WAIT_WITNESS_BOUND'
            attempt+=1;sequence=seq*100000+attempt
            children['observer'].send(sql.replace("'sequence',"+str(seq)+",", "'sequence',"+str(sequence)+","))
            witness=frame(children['observer'],'SNAPSHOT',sequence)
            witness['logicalSequence']=seq;report['snapshots'].append(witness)
            try:qualify_shared_locks(witness,identities,readers,waiting)
            except AssertionError:
                assert time.monotonic()<limit,'COMPLETE_WAIT_WITNESS_BOUND'
                continue
            break
    try:
        observer=start('observer')
        observer.send("DO $g$ BEGIN IF current_database()<>'postgres' OR current_user<>'postgres' OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure)<>'8bc0089c0f2d0fbccd3286a4022d90ea' OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.sync_event_scope_fence_key_v1(uuid,uuid)'::regprocedure)<>'5c56ddfa4e479e85a9158114722b14f8' OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure)<>'394bef66b0f19c3e64ae82e48d7187a3' OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.resolve_shop_sync_recovery_scope(uuid,text)'::regprocedure)<>'0f47ec89de6f5ea847548e55721d7f54' THEN RAISE EXCEPTION 'LOCAL_SOURCE_MISMATCH';END IF;END;$g$;\n"+emit('observer','READY',",'writerMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure),'checkpointMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure),'catalogWriterMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure),'resolverMD5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='app_private.resolve_shop_sync_recovery_scope(uuid,text)'::regprocedure)"))
        before=frame(observer,'READY')
        require(before['checkpointMD5'] == SHARED_BODY_MD5, 'matrix candidate CP drift')
        temporary=""
        for side in ['r1','r2']:
            c=start(side);c.send(temporary+f"SELECT app_private.lock_catalog_scope_pair_read_v1('{SCOPE}'::uuid,'{OWNER}'::uuid);\nSELECT app_private.acquire_sync_event_scope_read_fence_v1('{OWNER}'::uuid,'{SCOPE}'::uuid);\n"+emit(side,'READY',",'noWriterWitness',nullif(current_setting('app_private.sync_event_scope_fence',true),'') IS NULL"))
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
        report.update(status='PASS_LOCAL_COMBINED_READERS_ORIGINAL_WRITER_FENCE_MATRIX',noWriterWitness=True,qualifiedWriterUnchangedDuringMatrix=True,readers=identities,actualCPPerformanceMeasured=False)
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


def shared_reader_matrices(root,receipt_dir=None):
    receipts = {}
    for domain in ("catalog", "event"):
        require(shared_reader_matrix(root, domain,receipt_dir) == 0, "shared reader matrix failed; no retry")
        p = (receipt_dir or root/".replay") / ("shared-reader-concurrency-" + domain + ".json")
        result = json.loads(p.read_text())
        require(result["noWriterWitness"] and result["qualifiedWriterUnchangedDuringMatrix"]
                and all(x["rollbackAndNaturalExit"] and x["exit"] == 0 for x in result["cleanup"]),
                "matrix ownership/rollback drift")
        receipts[domain] = {"status": result["status"], "receiptSHA256": sha(p.read_bytes()), "snapshots": 3}
    dump((receipt_dir or root/".replay") / "shared-reader-matrices.json", receipts)


class _GuardedLockCase:
    """Bounded clients in the already-owned local clone; no business DML."""
    def __init__(self, root, label):
        require(sys.flags.optimize == 0, "lock assertions require ordinary Python")
        self.root=root; self.label=label; self.domain=label.split("-",1)[0]; self.owned=[]; self.children={}; self.identities={}
        self.selector=selectors.DefaultSelector(); self.deadline=time.monotonic()+30
        endpoint=local_endpoint(root)
        self.argv=["docker","exec","-i",endpoint["containerID"],"/nix/var/nix/profiles/default/bin/psql",
                   "-X","-qAt","-v","ON_ERROR_STOP=1","-v","VERBOSITY=sqlstate","-U","postgres","-d","postgres"]
    def pump(self, limit):
        require(time.monotonic()<min(limit,self.deadline),"LOCK_CASE_DEADLINE")
        for key,_ in self.selector.select(.025):
            child,kind=key.data; chunk=os.read(key.fileobj.fileno(),65536)
            if chunk: child.accept(kind,chunk)
            else: self.selector.unregister(key.fileobj)
    def frame(self, side, kind):
        child=self.children[side]; limit=min(time.monotonic()+3,self.deadline)
        while True:
            rows=[r for r in child.rows if r.get("kind")==kind]
            if rows:
                require(len(rows)==1,"LOCK_DUPLICATE_FRAME");return rows[0]
            require(child.process.poll() is None,"LOCK_EARLY_EXIT")
            self.pump(limit)
    def emit(self, side, kind, extra=""):
        return "SELECT 'PAIRJSON:'||jsonb_build_object('side','"+side+"','kind','"+kind+"','pid',pg_backend_pid()"+extra+")::text;\n"
    def start(self, side):
        c=_PairChild(side,self.argv,self.selector,self.owned);self.children[side]=c
        c.send("BEGIN; SET LOCAL statement_timeout='8s'; SET LOCAL search_path=pg_catalog;\n"+self.emit(side,"IDENTITY"))
        self.identities[side]=self.frame(side,"IDENTITY");return c
    def stop(self, side):
        c=self.children[side]
        if c.process.poll() is not None:return
        c.send("ROLLBACK;\n\\echo __PAIR_"+side.upper()+"_ROLLBACK__\n\\quit\n");c.process.stdin.close()
        limit=min(time.monotonic()+5,self.deadline)
        while c.process.poll() is None:self.pump(limit)
        for _ in range(3):
            if not self.selector.get_map():break
            self.pump(min(time.monotonic()+.1,self.deadline))
        require(c.process.returncode==0 and "__PAIR_"+side.upper()+"_ROLLBACK__" in c.markers,"LOCK_ROLLBACK_UNPROVEN")
    def locks(self, token):
        observer=self.children["observer"]
        pids=",".join(str(x["pid"]) for side,x in self.identities.items() if side!="observer")
        namespace='catalog_union_scope' if self.domain=='catalog' else 'sync_event_scope_fence_v1'
        values=[OWNER,SCOPE] if self.domain=='catalog' else ['shop:'+SCOPE]
        key_sql="jsonb_build_array("+",".join("jsonb_build_object('classid',(hashtext('"+namespace+"')::bigint&4294967295),'objid',(hashtext('"+value+"')::bigint&4294967295),'objsubid',2)" for value in values)+")"
        observer.send("SELECT pg_stat_clear_snapshot();\n"+self.emit("observer",token, ",'keys',"+key_sql+
          ",'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('pid',a.pid,'waitEventType',a.wait_event_type,'waitEvent',a.wait_event,'blockers',pg_blocking_pids(a.pid),'locks',coalesce((SELECT jsonb_agg(jsonb_build_object('mode',l.mode,'granted',l.granted,'classid',l.classid::bigint,'objid',l.objid::bigint,'objsubid',l.objsubid)) FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='advisory' AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())),'[]'::jsonb))) FROM pg_stat_activity a WHERE a.pid IN ("+pids+")),'[]'::jsonb)"))
        return self.frame("observer",token)
    def waiting(self, sides, token):
        attempt=0;limit=min(time.monotonic()+3,self.deadline)
        while True:
            snap=self.locks(token+str(attempt));rows={x['pid']:x for x in snap['rows']}
            if all(rows[self.identities[s]['pid']]['waitEventType']=='Lock' and rows[self.identities[s]['pid']]['waitEvent']=='advisory' for s in sides):return snap
            require(time.monotonic()<limit,"LOCK_WAIT_NOT_OBSERVED");self.pump(limit);attempt+=1
    def close(self):
        results=[]
        for side,c in self.children.items():
            ok=False
            try:self.stop(side);ok=c.process.returncode==0 and "__PAIR_"+side.upper()+"_ROLLBACK__" in c.markers
            except BaseException:pass
            if c.process.poll() is None:
                try:os.killpg(c.process.pid,signal.SIGTERM);c.process.wait(timeout=2)
                except BaseException:pass
            results.append({'side':side,'pid':c.process.pid,'exit':c.process.poll(),'rollbackAndNaturalExit':ok,
                            'sqlstates':c.sqlstates,'stderr':c.stderr.decode(errors='replace')})
        self.selector.close();return results


def _case_locks(h,snapshot,side,mode,granted,indices=None):
    rows={r['pid']:r for r in snapshot['rows']};row=rows[h.identities[side]['pid']]
    keys=snapshot['keys'] if indices is None else [snapshot['keys'][i] for i in indices]
    for key in keys:
        matches=[lock for lock in row['locks'] if all(lock[k]==key[k] for k in ('classid','objid','objsubid')) and lock['mode']==mode]
        require(len(matches)==1 and matches[0]['granted'] is granted,'LOCK_TARGET_MODE_GRANT_MISMATCH')


def shared_upgrade_case(root,domain,scenario,order,receipt_dir=None):
    require(domain in ('catalog','event') and scenario in ('uncontended','two-upgraders','writer-first','mixed-later-share'),"unknown lock case")
    require(scenario!='mixed-later-share' or domain=='catalog',"mixed catalog only")
    name=domain+'-'+scenario+'-'+''.join(order)
    out=(receipt_dir or root/'.replay')/('shared-upgrade-'+name+'.json');require(not out.exists(),"lock receipt exists")
    h=_GuardedLockCase(root,name);report={'status':'FAIL_UNFINISHED','domain':domain,'scenario':scenario,'order':order,
      'businessDML':False,'remoteTEST':False,'boundedSeconds':30,'snapshots':[],'outcomes':{}}
    read_call=(f"PERFORM app_private.lock_catalog_scope_pair_read_v1('{SCOPE}'::uuid,'{OWNER}'::uuid);" if domain=='catalog' else f"PERFORM app_private.acquire_sync_event_scope_read_fence_v1('{OWNER}'::uuid,'{SCOPE}'::uuid);")
    writer_call=(f"PERFORM app_private.lock_catalog_scope_pair_v1('{SCOPE}'::uuid,'{OWNER}'::uuid);" if domain=='catalog' else f"PERFORM app_private.acquire_sync_event_scope_fence_v1('{OWNER}'::uuid,'{SCOPE}'::uuid);")
    writer_select=writer_call.replace('PERFORM','SELECT',1)+'\n'
    def read(side,partial=False):
        c=h.start(side)
        # A prior witness must survive read and failed upgrade; it is scoped to
        # a different synthetic event key held by this client, not an app write.
        witness_shop=OTHER if side=='r1' else OTHER_OWNER
        c.send(f"SELECT app_private.acquire_sync_event_scope_fence_v1('{OWNER}'::uuid,'{witness_shop}'::uuid);\n")
        c.send("CREATE FUNCTION pg_temp.try_upgrade() RETURNS jsonb LANGUAGE plpgsql AS $u$ DECLARE prior text:=current_setting('app_private.sync_event_scope_fence',true); BEGIN BEGIN "+writer_call+" RETURN jsonb_build_object('side','"+side+"','kind','OUTCOME','sqlstate','00000'); EXCEPTION WHEN serialization_failure THEN RETURN jsonb_build_object('side','"+side+"','kind','OUTCOME','sqlstate','40001','witnessUnchanged',current_setting('app_private.sync_event_scope_fence',true) IS NOT DISTINCT FROM prior); END; END $u$;\n")
        statement=(f"PERFORM pg_advisory_xact_lock_shared(hashtext('catalog_union_scope'),hashtext('{SCOPE}'));" if partial else read_call)
        c.send("DO $r$ BEGIN "+statement+" END $r$;\n"+h.emit(side,'READ_READY'))
        return c
    def upgrade(side):
        h.children[side].send("SELECT 'PAIRJSON:'||pg_temp.try_upgrade()::text;\n")
    def outcome(side):
        r=h.frame(side,'OUTCOME');require(r['sqlstate'] in ('00000','40001'),'UPGRADE_UNEXPECTED_SQLSTATE')
        if r['sqlstate']=='40001':require(r['witnessUnchanged'],'UPGRADE_MINTED_WRITER_WITNESS')
        report['outcomes'][side]=r;return r
    before=snapshot(root)
    try:
        h.start('observer')
        if scenario=='uncontended':
            read('r1');h.frame('r1','READ_READY');pre=h.locks('PRE');_case_locks(h,pre,'r1','ShareLock',True);report['snapshots'].append(pre)
            upgrade('r1');require(outcome('r1')['sqlstate']=='00000','UNCONTENDED_UPGRADE_REJECTED')
            post=h.locks('POST');_case_locks(h,post,'r1','ExclusiveLock',True);report['snapshots'].append(post)
            h.children['r1'].send(writer_select+h.emit('r1','REENTRY_READY'));h.frame('r1','REENTRY_READY');report['exclusiveReentry']=True
        elif scenario=='two-upgraders':
            for side in order:read(side);h.frame(side,'READ_READY')
            pre=h.locks('PRE');
            for side in order:_case_locks(h,pre,side,'ShareLock',True)
            report['snapshots'].append(pre)
            # Both outer transactions retain their shared lock after the
            # catcher's inner subtransaction rolls back; require both40001.
            for side in order:upgrade(side)
            for side in order:require(outcome(side)['sqlstate']=='40001','CONTENDED_UPGRADE_NOT_REJECTED')
            post=h.locks('POST');
            for side in order:_case_locks(h,post,side,'ShareLock',True)
            report['snapshots'].append(post)
        elif scenario=='writer-first':
            w=h.start('writer');w.send(writer_select+h.emit('writer','WRITE_READY'));h.frame('writer','WRITE_READY')
            for side in order:read(side)
            waiting=h.waiting(order,'WAIT');_case_locks(h,waiting,'writer','ExclusiveLock',True);
            for side in order:_case_locks(h,waiting,side,'ShareLock',False,[0])
            report['snapshots'].append(waiting)
            h.stop('writer')
            for side in order:h.frame(side,'READ_READY')
            released=h.locks('READERS_RELEASED');
            for side in order:_case_locks(h,released,side,'ShareLock',True)
            report['snapshots'].append(released)
        else:
            read('r1',partial=True);h.frame('r1','READ_READY')
            w=h.start('writer');w.send(f"SELECT pg_advisory_xact_lock(hashtext('catalog_union_scope'),hashtext('{OWNER}'));\n"+h.emit('writer','FIRST_KEY_READY'))
            h.frame('writer','FIRST_KEY_READY');w.send(writer_select+h.emit('writer','WRITE_READY'))
            waiting=h.waiting(['writer'],'WAIT');_case_locks(h,waiting,'r1','ShareLock',True,[1]);_case_locks(h,waiting,'writer','ExclusiveLock',True,[0]);_case_locks(h,waiting,'writer','ExclusiveLock',False,[1]);report['snapshots'].append(waiting)
            upgrade('r1');require(outcome('r1')['sqlstate']=='40001','MIXED_UPGRADE_NOT_REJECTED')
            h.stop('r1');h.frame('writer','WRITE_READY');released=h.locks('WRITER_RELEASED');_case_locks(h,released,'writer','ExclusiveLock',True);report['snapshots'].append(released)
        report['status']='PASS_BOUNDED_LOCK_CASE'
    except BaseException as error:report.update(status='FAIL_LOCK_CASE',errorClass=type(error).__name__)
    finally:
        report['cleanup']=h.close()
        if not all(x['rollbackAndNaturalExit'] for x in report['cleanup']):report['status']='FAIL_LOCK_CASE_CLEANUP'
        require(snapshot(root)==before,'lock case changed functions/metadata/ledger')
        dump(out,report)
    require(report['status']=='PASS_BOUNDED_LOCK_CASE','lock case failed; no retry')
    return {'case':name,'status':report['status'],'receiptSHA256':sha(out.read_bytes())}


def shared_upgrade_cases(root,receipt_dir=None):
    results=[]
    for domain in ('catalog','event'):
        results.append(shared_upgrade_case(root,domain,'uncontended',['r1'],receipt_dir))
        for order in (['r1','r2'],['r2','r1']):
            results.append(shared_upgrade_case(root,domain,'two-upgraders',order,receipt_dir))
            results.append(shared_upgrade_case(root,domain,'writer-first',order,receipt_dir))
    results.append(shared_upgrade_case(root,'catalog','mixed-later-share',['r1','writer'],receipt_dir))
    dump((receipt_dir or root/'.replay')/'shared-upgrade-cases.json',{'status':'PASS','cases':results,'realApplicationAcceptance':'NOT_CLAIMED'})


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
    if timed_out or code != 0:
        global PREFIX_START_FAILURE_CATEGORY
        try:
            PREFIX_START_FAILURE_CATEGORY = prefix_start_failure_category(
                (root / ".replay/start.stderr").read_bytes(), timed_out)
        except OSError:
            PREFIX_START_FAILURE_CATEGORY = "PREFIX_START_FAILED"
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

def raw_apply(root, name, operator_name, binding_name, stage):
    inputs = prefix_manifest(root)
    local_endpoint(root)
    before = snapshot(root)
    if name == MOBILE_SALES:
        require(before["mobileSalesFunction"] is None and before["mobileSalesLocalStatements"] is None
                and MOBILE_SALES[:14] not in before["versions"], "mobile sales was already present")
        require(before["serverMajor"] == "17" and "statement_timeout=8s" in (before["authenticatedConfig"] or [])
                and before["mobileSalesStableDelegates"] == 7, "mobile sales prerequisites drift")
    canonical = (root / ".replay" / operator_name).read_bytes()
    put(root / "supabase/migrations" / name, canonical)
    dump(root / ".replay" / binding_name,
         {"derivedLOCALSHA256": sha(canonical), "canonicalSHA256": sha(canonical),
          "operatorSQLByteExactReplay": True, "profile": LOCAL_PROFILE})
    claim_apply_attempt(root / (".replay/" + stage + "-raw-attempt.json"),
                        {"migration": name, "SHA256": sha(canonical), "oneAttemptOnly": True})
    output = run(["supabase", "--workdir", str(root), "migration", "up", "--local"])
    put(root / (".replay/" + stage + "-raw-apply.stdout"), output)
    after = snapshot(root)
    require(all(after[k] == before[k] for k in ("database", "effectiveRole", "serverMajor", "ssl", "authenticatedConfig")),
            "raw apply identity/auth/timeout drift")
    require(after["versions"] == before["versions"] + [name[:14]], "raw apply ledger version drift")
    ledger_key = {TARGET: "localStatement", PRODUCT: "productLocalStatement",
                  SHARED: "sharedLocalStatements", MOBILE_SALES: "mobileSalesLocalStatements",
                  NATIVE_EMPTY: "nativeEmptyScopeLocalStatements"}[name]
    ledger = after[ledger_key]
    verify_statement_sequence(ledger if isinstance(ledger, list) else [ledger], canonical)
    if name == TARGET:
        require(md5(after["functions"]["helper"]["body"].encode()) == "6fb3118d630941b56b6772db94868567"
                and after["functions"]["helper"]["metadataText"] == before["functions"]["helper"]["metadataText"]
                and after["functions"]["public"] == before["functions"]["public"], "raw metadata helper body/metadata drift")
    elif name == PRODUCT:
        require(md5(after["functions"]["public"]["body"].encode()) == PRODUCT_BODY_MD5
                and after["functions"]["public"]["metadataText"] == before["functions"]["public"]["metadataText"]
                and after["functions"]["helper"] == before["functions"]["helper"], "raw product body/metadata drift")
    elif name == SHARED:
        hashes = WRITER_BODY_HASHES
        for signature, previous in before["sharedFunctions"].items():
            current = after["sharedFunctions"][signature]
            if signature in hashes:
                require(md5(current["body"].encode()) == hashes[signature] and current["metadataText"] == previous["metadataText"]
                        and current["names"] == previous["names"], "raw writer intended body/metadata drift")
            elif signature == "public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)":
                require(md5(current["body"].encode()) == SHARED_BODY_MD5 and current["metadataText"] == previous["metadataText"], "raw checkpoint body/metadata drift")
            else: require(current == previous, "raw unrelated shared function drift")
        require(len(after["sharedHelpers"]) == 4, "raw shared helper membership drift")
    elif name == NATIVE_EMPTY:
        previous = before["nativeEmptyScopeFunction"]
        current = after["nativeEmptyScopeFunction"]
        require(md5(current["body"].encode()) == NATIVE_EMPTY_BODY_MD5
                and current["metadataText"] == previous["metadataText"],
                "native empty scope body/metadata drift")
        changed = {"versions", "nativeEmptyScopeFunction", "nativeEmptyScopeLocalStatements"}
        require({k: v for k, v in after.items() if k not in changed}
                == {k: v for k, v in before.items() if k not in changed},
                "native empty scope changed unrelated catalog snapshot")
    else:
        require(name == MOBILE_SALES and after["mobileSalesStableDelegates"] == 7,
                "mobile sales stable delegate contract drift")
        expected = {
            "owner": "postgres", "bodyMD5": MOBILE_SALES_BODY_MD5, "language": "plpgsql",
            "returnType": "jsonb", "argumentCount": 15, "defaultArgumentCount": 12,
            "securityDefiner": True, "volatility": "v", "strict": False, "parallel": "u",
            "authenticatedExecute": True, "anonymousExecute": False,
            "serviceRoleExecute": False, "publicExecute": False,
        }
        actual = dict(after["mobileSalesFunction"] or {})
        config_values = actual.pop("config", [])
        require(actual == expected and len(config_values) == 2
                and set(config_values) == {'search_path=""', 'TimeZone=UTC'},
                "mobile sales function or effective ACL drift")
        changed = {"versions", "mobileSalesFunction", "mobileSalesLocalStatements"}
        require({k: v for k, v in after.items() if k not in changed}
                == {k: v for k, v in before.items() if k not in changed},
                "mobile sales replay changed unrelated catalog snapshot")
    dump(root / (".replay/" + stage + "-raw-verified.json"),
         {"status": "PASS_CANONICAL_BYTE_EXACT", "migration": name, "SHA256": sha(canonical),
          "wholeActualMetadataPreserved": True, "auth8sPreserved": True,
          "intendedWriterBodyChange": name == SHARED, "operatorSQLByteExactReplay": True,
          "snapshot": after})
    prefix_manifest(root)


def apply_reviewed_extension(root, name, spec):
    prefix_manifest(root)
    local_endpoint(root)
    before = snapshot(root)
    canonical = (root / '.replay' / name).read_bytes()
    require(sha(canonical) == spec['sha256'] and name[:14] not in before['versions'], 'extension apply precondition')
    put(root / 'supabase/migrations' / name, canonical)
    claim_apply_attempt(root / ('.replay/' + name + '.attempt.json'),
                        {'migration':name,'SHA256':spec['sha256'],'oneAttemptOnly':True})
    output = run(['supabase','--workdir',str(root),'migration','up','--local'])
    put(root / ('.replay/' + name + '.stdout'), output)
    after = snapshot(root)
    require(after['versions'] == before['versions'] + [name[:14]], 'extension ledger drift')
    require({k:v for k,v in before.items() if k != 'versions'} ==
            {k:v for k,v in after.items() if k != 'versions'}, 'extension changed an existing runtime contract')
    dump(root / ('.replay/' + name + '.verified.json'),
         {'status':'PASS_CANONICAL_BYTE_EXACT','migration':name,'SHA256':spec['sha256'],
          'existingRuntimeContractsPreserved':True})
    prefix_manifest(root)


def replay(repo, workdir, bootstrap_only=False):
    global ERROR_ROOT, REPLAY_STAGE
    os.umask(0o077)
    require(cli_binary() is not None, "missing CLI")
    prepare(repo, workdir)
    root = root_path(workdir); ERROR_ROOT = root
    inputs = prefix_manifest(root)
    tests = sorted(name for name in inputs["files"] if name.startswith("supabase/tests/") and name.endswith(".sql"))
    extension_tests = {spec["testFile"] for spec in REVIEWED_EXTENSIONS.values()}
    require(len(extension_tests) == len(REVIEWED_EXTENSIONS) and extension_tests.issubset(tests)
            and len(tests) == 67 + len(extension_tests) and "supabase/tests/asus_019_native_empty_catalog_scope.sql" in tests,
            "reviewed HEAD database test membership changed")
    for name, action in (("fresh local gate", empty_local), ("prefix bootstrap", start_prefix),
                         ("observed local ownership", observe_owned_creation)):
        REPLAY_STAGE = name; print("Database replay: " + name, flush=True); action(root)
    if bootstrap_only:
        dump(root / ".replay/bootstrap-complete.json", {"status":"PASS_OWNED_PREFIX_ONLY", "head":inputs["head"], "profile":LOCAL_PROFILE, "runnerSHA256":inputs["runnerSHA256"], "pendingPortableMigrations":[TARGET,PRODUCT,SHARED,MOBILE_SALES,NATIVE_EMPTY,*sorted(REVIEWED_EXTENSIONS)]})
        print("Database replay: owned prefix complete; portable overlays NOT_APPLIED",flush=True)
        return
    for name, operator, binding, stage in ((TARGET,"operator.sql","binding.json","metadata"),
        (PRODUCT,"product-operator.sql","product-binding.json","product"),
        (SHARED,"shared-reader-operator.sql","shared-reader-binding.json","shared")):
        REPLAY_STAGE = "canonical raw " + stage; print("Database replay: " + REPLAY_STAGE, flush=True)
        raw_apply(root,name,operator,binding,stage)
    REPLAY_STAGE = "shared reader writer matrices"
    shared_reader_matrices(root)
    REPLAY_STAGE = "shared upgrade and writer-first regressions"
    shared_upgrade_cases(root)
    REPLAY_STAGE = "canonical raw mobile sales"
    print("Database replay: " + REPLAY_STAGE, flush=True)
    raw_apply(root, MOBILE_SALES, "mobile-sales-operator.sql", "mobile-sales-binding.json", "mobile-sales")
    REPLAY_STAGE = "canonical raw native empty scope"
    print("Database replay: " + REPLAY_STAGE, flush=True)
    raw_apply(root, NATIVE_EMPTY, "native-empty-operator.sql", "native-empty-binding.json", "native-empty")
    for name, spec in sorted(REVIEWED_EXTENSIONS.items()):
        REPLAY_STAGE = 'reviewed extension ' + name
        print('Database replay: ' + REPLAY_STAGE, flush=True)
        apply_reviewed_extension(root, name, spec)
    REPLAY_STAGE = "pgTAP"; print("Database replay: pgTAP", flush=True)
    output = run([str(cli_binary()[0]), "--workdir", str(root), "test", "db", "--local"])
    put(root / ".replay/pgtap.stdout", output)
    summary = re.search(rb"(?m)^Files=(\d+), Tests=(\d+),", output)
    expected_assertions = 4375 + sum(spec['additionalAssertions'] for spec in REVIEWED_EXTENSIONS.values())
    require(summary is not None and int(summary[1]) == len(tests) and int(summary[2]) == expected_assertions
            and re.search(rb"(?m)^Result: PASS\s*$", output) is not None, "database test summary mismatch")
    prefix_manifest(root)
    complete = {"status": "LOCAL_CANONICAL_BYTE_EXACT_AND_PGTAP_PASS", "head": inputs["head"],
      "CLI": CLI_VERSION, "profile": LOCAL_PROFILE, "runnerSHA256": inputs["runnerSHA256"],
      "operatorSHA256": OP_SHA, "bodySHA256": BODY_SHA, "databaseTestFiles": tests,
      "pgTAPFiles": int(summary[1]), "pgTAPTests": int(summary[2]),
      "verifiedSHA256": sha((root / ".replay/product-raw-verified.json").read_bytes()),
      "productMigrationSHA256": PRODUCT_SHA, "productPublicProsrcMD5": PRODUCT_BODY_MD5,
      "sharedReaderMigrationSHA256": SHARED_SHA, "sharedReaderPublicProsrcMD5": SHARED_BODY_MD5,
      "sharedReaderVerifiedSHA256": sha((root / ".replay/shared-raw-verified.json").read_bytes()),
      "sharedReaderMatricesSHA256": sha((root / ".replay/shared-reader-matrices.json").read_bytes()),
      "sharedUpgradeCasesSHA256": sha((root / ".replay/shared-upgrade-cases.json").read_bytes()),
      "sharedUpgradeCaseCount": 11,
      "mobileSalesMigrationVersion": MOBILE_SALES[:14],
      "mobileSalesMigrationSHA256": MOBILE_SALES_SHA,
      "mobileSalesVerifiedSHA256": sha((root / ".replay/mobile-sales-raw-verified.json").read_bytes()),
      "nativeEmptyScopeMigrationSHA256": NATIVE_EMPTY_SHA,
      "nativeEmptyScopeBodyMD5": NATIVE_EMPTY_BODY_MD5,
      "nativeEmptyScopeVerifiedSHA256": sha((root / ".replay/native-empty-raw-verified.json").read_bytes()),
      "pgtapStdoutSHA256": sha(output), "operatorSQLByteExactReplay": True,
      "localACLIsTESTEquivalent": "NOT_CLAIMED"}
    dump(root / ".replay/complete.json", complete); export_complete(complete)
    REPLAY_STAGE = "complete"; print("Database replay: complete", flush=True)

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
              "sharedUpgradeCasesSHA256": complete["sharedUpgradeCasesSHA256"],
              "sharedUpgradeCaseCount": complete["sharedUpgradeCaseCount"],
              "mobileSalesMigrationVersion": complete["mobileSalesMigrationVersion"],
              "mobileSalesMigrationSHA256": complete["mobileSalesMigrationSHA256"],
              "mobileSalesVerifiedSHA256": complete["mobileSalesVerifiedSHA256"],
              "nativeEmptyScopeMigrationSHA256": complete["nativeEmptyScopeMigrationSHA256"],
              "nativeEmptyScopeBodyMD5": complete["nativeEmptyScopeBodyMD5"],
              "nativeEmptyScopeVerifiedSHA256": complete["nativeEmptyScopeVerifiedSHA256"],
              "pgtapStdoutSHA256": complete["pgtapStdoutSHA256"],
              "operatorSQLByteExactReplay": complete["operatorSQLByteExactReplay"], "localACLIsTESTEquivalent": "NOT_CLAIMED",
              "profile": complete["profile"], "runnerSHA256": complete["runnerSHA256"]})

def export_error(error):
    if EVIDENCE_ROOT is not None:
        category = ("INTERRUPTED" if isinstance(error, (KeyboardInterrupt, SystemExit)) else
                    "TIMEOUT" if isinstance(error, subprocess.TimeoutExpired) else
                    "IO_ERROR" if isinstance(error, OSError) else
                    "GUARD_REJECTED" if isinstance(error, ValueError) else "UNEXPECTED_ERROR")
        if (REPLAY_STAGE == "prefix bootstrap" and
                isinstance(error, ValueError) and
                PREFIX_START_FAILURE_CATEGORY in PREFIX_START_CATEGORIES):
            category = PREFIX_START_FAILURE_CATEGORY
        try:
            dump(EVIDENCE_ROOT / "error.json",
                 {"status": "FAIL", "stage": REPLAY_STAGE, "category": category})
        except OSError:
            print("Database replay: closed error evidence could not be written", file=sys.stderr)
        # Never serialize str(error), exception attributes, argv, stdout or stderr.

def main():
    global ERROR_ROOT, EVIDENCE_ROOT, LOCAL_PROFILE
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["run", "bootstrap", "prepare", "empty-local"])
    parser.add_argument("--profile", choices=["ci", "task146-host"], default="ci")
    parser.add_argument("--workdir", required=True)
    parser.add_argument("--repo")
    parser.add_argument("--evidence-dir")
    args = parser.parse_args()
    LOCAL_PROFILE = args.profile
    if args.mode in ("run", "bootstrap", "prepare"):
        require(args.repo is not None, "repo required")
        if args.mode in ("run", "bootstrap"):
            require(args.evidence_dir is not None, "fresh evidence directory required")
            evidence = Path(args.evidence_dir)
            require(evidence.is_absolute() and not evidence.exists() and not evidence.is_symlink(),
                    "evidence directory must be new and absolute")
            evidence.mkdir(mode=0o700)
            EVIDENCE_ROOT = evidence.resolve()
            try:
                replay(args.repo, args.workdir, bootstrap_only=args.mode == "bootstrap")
            except BaseException as error:
                export_error(error)
                raise
        else:
            prepare(args.repo, args.workdir)
    else:
        root = root_path(args.workdir)
        ERROR_ROOT = root
        empty_local(root)


if __name__ == "__main__":
    main()
