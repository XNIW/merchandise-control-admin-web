#!/usr/bin/env python3
"""Prove address create concurrency on an explicitly isolated synthetic database.

The caller provisions the local schema. This runner refuses networked containers
and shared/default database names; it never discovers credentials or remote URLs.
"""
import argparse
import json
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
parser.add_argument('--database', required=True)
parser.add_argument('--baseline', action='store_true')
args = parser.parse_args()
if not args.database.startswith('task054_address_'):
    parser.error('database must be a dedicated task054_address_ database')
network = subprocess.check_output(
    ['docker', 'inspect', '--format', '{{.HostConfig.NetworkMode}}', args.container], text=True).strip()
if network != 'none':
    parser.error('container must have network=none')
command = ['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt',
           '-U', 'supabase_admin', '-d', args.database, '-v', 'ON_ERROR_STOP=1']


def sql(query):
    return subprocess.check_output(command, input=query, text=True).strip()


owner = '00000000-0000-4000-8000-000000054351'
session = '00000000-0000-4000-8000-000000054352'
intent = '00000000-0000-4000-8000-000000054353'
payload = json.dumps({'label': 'Casa', 'recipientName': 'Test concorrente',
                      'addressLine1': 'Calle sintetica 1', 'commune': 'Santiago',
                      'region': 'Metropolitana', 'isDefault': True})
claims = json.dumps({'sub': owner, 'role': 'authenticated', 'session_id': session})
call = (f"public.customer_address_upsert_v2(null,null,'{payload}'::jsonb)"
        if args.baseline else f"public.customer_address_create_v3('{intent}','{payload}'::jsonb)")
setup = f"""
insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','{owner}','authenticated','authenticated',
 'address-v3-concurrent@example.invalid','{{"provider":"email","providers":["email"]}}','{{}}',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values('{session}','{owner}',now(),now());
"""
sql(setup)
processes = []
try:
    first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, bufsize=1)
    processes.append(first)
    first.stdin.write(f"begin; set local role authenticated; set local request.jwt.claims = '{claims}';\nselect {call};\n")
    first.stdin.flush()
    first_result = json.loads(first.stdout.readline())
    if first_result['status'] != 'ok':
        raise AssertionError('first create did not succeed')
    second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True)
    processes.append(second)
    second.stdin.write(f"set application_name='task054-address-v3-contender'; begin; set local role authenticated; set local request.jwt.claims = '{claims}'; select {call}; commit;\n")
    second.stdin.close()
    deadline = time.monotonic() + 5
    contended = False
    while time.monotonic() < deadline:
        contended = sql("select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='task054-address-v3-contender' and wait_event_type='Lock' and wait_event='advisory');") == 't'
        if contended:
            break
        time.sleep(0.02)
    if not contended:
        raise AssertionError('second request did not demonstrably wait on the transaction lock')
    first.stdin.write('commit;\n')
    first.stdin.close()
    first.wait(timeout=10)
    second_result = json.loads(second.stdout.readline())
    second.wait(timeout=10)
    if first.returncode or second.returncode:
        raise AssertionError('concurrent psql failed')
    row_count = int(sql(f"select count(*) from public.customer_addresses where user_id='{owner}';"))
    same_id = first_result['address']['id'] == second_result['address']['id']
    same_version = first_result['address']['version'] == second_result['address']['version']
    receipt = {'scope': 'local_synthetic', 'baseline': args.baseline,
               'advisory_contention_observed': contended, 'canonical_count': row_count,
               'same_canonical_id': same_id, 'same_version': same_version,
               'result': 'PASS' if row_count == 1 and same_id and same_version else 'FAIL'}
    print(json.dumps(receipt, indent=2))
    raise SystemExit(0 if receipt['result'] == 'PASS' else 1)
finally:
    for process in processes:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
    # Only this runner's synthetic owner; account cascade removes addresses/ledger.
    sql(f"delete from auth.users where id='{owner}';")
