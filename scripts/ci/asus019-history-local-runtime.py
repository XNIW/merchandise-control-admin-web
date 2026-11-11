"""Private descriptor for the already owned canonical disposable replay.

Consumed only through a captured pipe by the authenticated service harness.
Never run against a linked database; never publish its stdout or CLI status.
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workdir', required=True)
    args = parser.parse_args()
    source = Path(__file__).with_name('mobile-recovery-local-replay.py')
    spec = importlib.util.spec_from_file_location('asus019_owned_replay', source)
    replay = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = replay
    spec.loader.exec_module(replay)
    root = replay.root_path(args.workdir)
    complete = json.loads((root / '.replay/complete.json').read_text())
    replay.require(complete['status'] == 'LOCAL_CANONICAL_BYTE_EXACT_AND_PGTAP_PASS', 'canonical replay incomplete')
    replay.prefix_manifest(root)
    endpoint = replay.local_endpoint(root)
    status = json.loads(replay.cli(root, 'status', '--output', 'json'))
    api = urlparse(status['API_URL'])
    replay.require(api.scheme == 'http' and api.hostname == '127.0.0.1'
                   and api.port == 54321 and api.path in ('', '/')
                   and not api.username and not api.query and not api.fragment, 'owned API scope')
    replay.require(all(isinstance(status[k], str) and len(status[k]) >= 20
                       for k in ('ANON_KEY', 'SERVICE_ROLE_KEY')), 'owned credentials absent')
    sys.stdout.write(json.dumps({'containerID': endpoint['containerID'], 'project': endpoint['project'],
                                'url': status['API_URL'], 'anonKey': status['ANON_KEY'],
                                'serviceKey': status['SERVICE_ROLE_KEY'], 'head': complete['head']}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.stderr.write('authenticated_history_owned_runtime_rejected\n')
        sys.exit(1)
