"""Bounded real PostgreSQL sessions, only in the canonical disposable CI clone.

The existing synthetic CLR corpus is admitted through the actual baseline and
review functions. It is installed after pgTAP (whose fixture transactions have
rolled back), never in a linked database. No public v2 boundary is exposed.
"""
import json
import subprocess
import time
from pathlib import Path

SHOP = "10000000-0000-4000-8000-000000403019"
SCHEMA = "asus019_concurrency"


def build_setup(fixture, check):
    anchor = "select ok(not has_function_privilege('service_role','app_private.payment_history_local_authorize_v2("
    check(fixture.count(anchor) == 1, "HISTORY_FIXTURE_BOUNDARY")
    prefix = fixture.split(anchor)[0]
    check(prefix.count("select plan(54);") == 1, "HISTORY_FIXTURE_PLAN")
    prefix = prefix.replace("select plan(54);", "")
    prefix = prefix.replace("set local search_path=public,extensions;",
                            "create schema " + SCHEMA + "; set local search_path=" + SCHEMA + ",public,extensions;")
    prefix = prefix.replace("create temp table ", "create table ").replace("pg_temp.", SCHEMA + ".")
    native_start = fixture.index("insert into public.pos_sales_sync_batches(")
    native_end = fixture.index("$$;", fixture.index("create function pg_temp.native_at(", native_start)) + 3
    native = fixture[native_start:native_end].replace("pg_temp.", SCHEMA + ".")
    return (prefix + native + "\nselect " + SCHEMA + ".stage_case('a-new');\nselect " + SCHEMA + ".review_case('a-new');\n"
             "select " + SCHEMA + ".stage_case('a-duplicate');\nselect " + SCHEMA + ".review_case('a-duplicate');\ncommit;\n")


def qualify(root, runner, evidence_root=None):
    check = runner.require
    endpoint = runner.local_endpoint(root)  # Existing container/scope guard.
    argv = ["docker", "exec", "-i", endpoint["containerID"],
            "/nix/var/nix/profiles/default/bin/psql", "-X", "-qAt",
            "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate",
            "-U", "postgres", "-d", "postgres"]
    source_root = Path(runner.__file__).resolve().parents[2]
    fixture = (source_root / "supabase/tests/asus019_payment_history_local_content_grants.sql").read_text(encoding="utf-8")
    setup = build_setup(fixture, check)
    # Source SQL is entirely the checked-in synthetic fixture. No user SQL, URL,
    # linked target, credential or arbitrary command is accepted by this module.
    initialized = subprocess.run(argv, input=setup.encode("utf-8"), capture_output=True, timeout=45, check=False)
    report = {"status": "FAIL_UNFINISHED", "ownedLocalOnly": True, "remoteTEST": False,
              "syntheticBusinessDML": True, "publicBoundaryExposed": False,
              "fixtureSHA256": runner.sha(fixture.encode("utf-8")),
              "setupSHA256": runner.sha(setup.encode("utf-8")), "cases": [], "cleanup": []}
    output = (evidence_root or root / ".replay") / "history-concurrency.json"
    runner.dump(output, report)
    check(initialized.returncode == 0 and len(initialized.stdout) + len(initialized.stderr) <= 49152,
          "HISTORY_CONCURRENCY_SETUP")

    def start(h, side):
        c = h.start(side)
        c.send("SET LOCAL search_path=" + SCHEMA + ",public,extensions,pg_catalog;\n"
               "SET LOCAL request.jwt.claim.role='service_role';\n"
               "SET LOCAL request.jwt.claims='{\"role\":\"service_role\"}';\n")
        return c

    def outcome(h, side, kind, body):
        h.children[side].send("CREATE FUNCTION pg_temp.try_" + kind.lower() + "() RETURNS jsonb LANGUAGE plpgsql AS $b$ "
            "DECLARE value jsonb; BEGIN " + body + "; RETURN jsonb_build_object('sqlstate','00000','value',value); "
            "EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('sqlstate',SQLSTATE); END $b$;\n" +
            h.emit(side, kind, ",'result',pg_temp.try_" + kind.lower() + "()"))

    def wait_for(h, waiter, blocker, label):
        until = min(h.deadline, time.monotonic() + 3)
        attempt = 0
        while True:
            attempt += 1
            token = label + str(attempt)
            pid = h.identities[waiter]["pid"]
            h.children["observer"].send("SELECT pg_stat_clear_snapshot();\n" + h.emit("observer", token,
                ",'waiting',(SELECT jsonb_build_object('pid',pid,'backendStart',backend_start,'xactStart',xact_start,"
                "'waitType',wait_event_type,'waitEvent',wait_event,'blockers',pg_blocking_pids(pid)) "
                "FROM pg_stat_activity WHERE pid=" + str(pid) + ")"))
            row = h.frame("observer", token)["waiting"]
            if row and row["waitType"] == "Lock" and h.identities[blocker]["pid"] in row["blockers"]:
                return row
            check(time.monotonic() < until, "HISTORY_WAIT_WITNESS_MISSING")
            h.pump(until)

    def finish(h):
        cleanup = h.close()
        # Never export raw stderr/SQL. Every process must complete its owned
        # rollback/EOF naturally; a forced local termination cannot be PASS.
        closed = [{"side": r["side"], "exit": r["exit"],
                   "rollbackAndNaturalExit": r["rollbackAndNaturalExit"],
                   "sqlstates": r["sqlstates"]} for r in cleanup]
        report["cleanup"].extend(closed)
        check(all(r["rollbackAndNaturalExit"] for r in closed), "HISTORY_CLEANUP_UNPROVEN")

    h = None
    try:
        # Native acceptance owns the real physical fence while an authorizer
        # owns runtime and waits behind it. Native completion must not need the
        # runtime lock in reverse order. Both mutations roll back in this case.
        h = runner._GuardedLockCase(root, "history-native-before-grant")
        start(h, "observer")
        native_client = start(h, "native")
        native_client.send("SELECT " + SCHEMA + ".native_at('2026-11-11','concurrent-native');\n" + h.emit("native", "NATIVE_READY"))
        h.frame("native", "NATIVE_READY")
        start(h, "grant")
        outcome(h, "grant", "GRANT", "value:=" + SCHEMA + ".authorize_case('a-new')")
        witness = wait_for(h, "grant", "native", "NATIVE_WAIT")
        h.stop("native")
        granted = h.frame("grant", "GRANT")["result"]
        check(granted["sqlstate"] == "00000" and granted["value"]["state"] == "authorized", "HISTORY_NATIVE_GRANT_COMPLETION")
        report["cases"].append({"id": "native-before-authorizer", "status": "PASS", "wait": witness})
        finish(h); h = None

        # Two simultaneous authorizers must serialize on runtime and recover
        # the same immutable grant/proof after the first transaction commits.
        h = runner._GuardedLockCase(root, "history-two-authorizers")
        start(h, "observer"); start(h, "first"); start(h, "second")
        outcome(h, "first", "FIRST", "value:=" + SCHEMA + ".authorize_case('a-new')")
        first = h.frame("first", "FIRST")["result"]
        check(first["sqlstate"] == "00000", "HISTORY_FIRST_AUTHORIZE")
        outcome(h, "second", "SECOND", "value:=" + SCHEMA + ".authorize_case('a-new')")
        witness = wait_for(h, "second", "first", "GRANT_WAIT")
        h.children["first"].send("COMMIT; BEGIN;\n" + h.emit("first", "COMMITTED"))
        h.frame("first", "COMMITTED")
        second = h.frame("second", "SECOND")["result"]
        check(second["sqlstate"] == "00000" and first["value"]["proof"] == second["value"]["proof"]
              and first["value"]["grant_id"] == second["value"]["grant_id"]
              and second["value"]["remaining_milliseconds"] <= first["value"]["remaining_milliseconds"],
              "HISTORY_GRANT_REPLAY_CHANGED")
        h.children["second"].send("COMMIT; BEGIN;\n" + h.emit("second", "COMMITTED"))
        h.frame("second", "COMMITTED")
        start(h, "other")
        outcome(h, "other", "UNKNOWN", "value:=" + SCHEMA + ".authorize_case('a-duplicate')")
        check(h.frame("other", "UNKNOWN")["result"]["sqlstate"] == "40001", "HISTORY_UNKNOWN_NOT_FENCED")
        outcome(h, "other", "OVERLAP", "PERFORM " + SCHEMA + ".native_at('2024-01-01','concurrent-overlap')")
        check(h.frame("other", "OVERLAP")["result"]["sqlstate"] == "40001", "HISTORY_OVERLAP_NOT_FENCED")
        report["cases"].append({"id": "two-authorizers-one-original-proof", "status": "PASS", "wait": witness,
                                "unknownOperationDenied": True, "overlappingNativeDenied": True})
        finish(h); h = None

        # Freeze wins runtime first. Replaying the original grant waits, then
        # returns the original proof with zero local-write budget, and freeze
        # retains that exact operation rather than dropping an unknown outcome.
        h = runner._GuardedLockCase(root, "history-freeze-before-replay")
        start(h, "observer"); freeze = start(h, "freeze"); start(h, "replay")
        freeze.send("UPDATE public.payment_history_runtime SET writer_authority='frozen',writer_epoch=writer_epoch+1 WHERE shop_id='" + SHOP + "';\n" + h.emit("freeze", "FROZEN"))
        h.frame("freeze", "FROZEN")
        outcome(h, "replay", "REPLAY", "value:=" + SCHEMA + ".authorize_case('a-new')")
        witness = wait_for(h, "replay", "freeze", "FREEZE_WAIT")
        freeze.send("COMMIT; BEGIN;\n" + h.emit("freeze", "COMMITTED")); h.frame("freeze", "COMMITTED")
        replay = h.frame("replay", "REPLAY")["result"]
        check(replay["sqlstate"] == "00000" and replay["value"]["remaining_milliseconds"] == 0
              and replay["value"]["proof"] == first["value"]["proof"], "HISTORY_FROZEN_REPLAY_CHANGED")
        h.children["observer"].send(h.emit("observer", "COUNTS",
            ",'native',(SELECT count(*) FROM public.pos_sales WHERE shop_id='" + SHOP + "'),"
            "'grants',(SELECT count(*) FROM public.payment_history_local_publications WHERE shop_id='" + SHOP + "' AND grant_id IS NOT NULL),"
            "'drain',(SELECT count(*) FROM public.payment_history_local_drain_set WHERE operation_id='" + first["value"]["operation_id"] + "')"))
        counts = h.frame("observer", "COUNTS")
        check(counts["native"] == 0 and counts["grants"] == 1 and counts["drain"] == 1, "HISTORY_CONCURRENCY_FINAL_COUNTS")
        report["cases"].append({"id": "freeze-before-grant-replay", "status": "PASS", "wait": witness,
                                "originalProofRetained": True, "remainingMilliseconds": 0, "nativeSales": 0, "grants": 1, "drain": 1})
        finish(h); h = None
        report["status"] = "PASS"
    finally:
        if h is not None:
            try: finish(h)
            except BaseException: report["cleanupUnproven"] = True
        runner.dump(output, report)
    return {"status": "PASS", "cases": len(report["cases"]), "receiptSHA256": runner.sha(output.read_bytes()),
            "harnessSHA256": runner.sha(Path(__file__).read_bytes())}
