"""Exercise the real driver control flow without SQL, Docker or external state.
This tests evidence finalization/cleanup; real lock qualification stays in CI.
"""
import hashlib,importlib.util,json,tempfile,time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

repo=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("history_driver",repo/"scripts/ci/asus019-history-concurrency.py")
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Child:
    def send(self,text):
        assert isinstance(text,str) and len(text)<32768

class Harness:
    mode="pass"
    def __init__(self,root,label):
        self.label=label;self.children={};self.identities={};self.deadline=time.monotonic()+30
    def start(self,side):
        self.children[side]=Child();self.identities[side]={"pid":100+len(self.children)};return self.children[side]
    def emit(self,*args):return "SELECT 'synthetic frame';\n"
    def pump(self,*args):pass
    def stop(self,*args):pass
    def frame(self,side,kind):
        if kind.startswith(("NATIVE_WAIT","GRANT_WAIT","FREEZE_WAIT")):
            blocker="native" if kind.startswith("NATIVE_WAIT") else "first" if kind.startswith("GRANT_WAIT") else "freeze"
            return {"waiting":{"waitType":"Lock","blockers":[self.identities[blocker]["pid"]]}}
        if kind in ("GRANT","FIRST","SECOND","REPLAY"):
            if self.mode=="failure" and kind=="GRANT":raise ValueError("HISTORY_TEST_FAILURE")
            return {"result":{"sqlstate":"00000","value":{"state":"authorized","grant_id":"synthetic-grant",
                "proof":{"original":True},"remaining_milliseconds":0 if kind=="REPLAY" else 50000,"operation_id":"synthetic-operation"}}}
        if kind in ("UNKNOWN","OVERLAP"):
            return {"result":{"sqlstate":"40001","code":"payment_history_local_publications_not_drained" if kind=="UNKNOWN" else "payment_history_local_native_overlap"}}
        if kind=="COUNTS":return {"native":0,"grants":1,"drain":1}
        return {}
    def close(self):
        return [{"side":side,"exit":0,"rollbackAndNaturalExit":self.mode!="cleanup","sqlstates":[],
                 "stderr":"ERROR: 42P01\n PRIVATE_SENTINEL password=cookie"} for side in self.children]

def require(ok,code):
    if not ok:raise ValueError(code)

def dump(path,value):
    # Same exclusive publication contract as the canonical replay runner.
    with path.open("x",encoding="utf-8") as f:json.dump(value,f)

runner=SimpleNamespace(__file__=str(repo/"scripts/ci/mobile-recovery-local-replay.py"),require=require,
    local_endpoint=lambda root:{"containerID":"synthetic-never-executed"},_GuardedLockCase=Harness,
    sha=lambda raw:hashlib.sha256(raw).hexdigest(),dump=dump)
root=Path(tempfile.mkdtemp(prefix="asus019-driver-")) # Owned synthetic receipts retained.
for mode in ("pass","setup","failure","cleanup"):
    output=root/mode;output.mkdir();Harness.mode=mode
    process=SimpleNamespace(returncode=1 if mode=="setup" else 0,stdout=b"",stderr=b"ERROR: 42P01\n PRIVATE_SENTINEL password=cookie")
    error=None
    with patch.object(module.subprocess,"run",return_value=process):
        try:result=module.qualify(root,runner,output)
        except ValueError as failure:error=str(failure)
    report=json.loads((output/"history-concurrency.json").read_text(encoding="utf-8"))
    assert "PRIVATE_SENTINEL" not in json.dumps(report) and "password" not in json.dumps(report)
    if mode=="pass":
        assert error is None and result["status"]==report["status"]=="PASS" and result["cases"]==3
        assert result["receiptSHA256"]==hashlib.sha256((output/"history-concurrency.json").read_bytes()).hexdigest()
    elif mode=="setup":assert error=="HISTORY_CONCURRENCY_SETUP" and report["status"]=="FAIL_SETUP" and report["setupSQLSTATES"]==["42P01"]
    elif mode=="failure":assert error==report["failureCode"]=="HISTORY_TEST_FAILURE" and report["status"]=="FAIL"
    else:assert error=="HISTORY_CLEANUP_UNPROVEN" and report["status"]=="FAIL" and report["cleanupUnproven"]
print("history-concurrency-driver 4 cases PASS; SQL NOT_RUN")
