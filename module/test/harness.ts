// Loads the module into SpacetimeDB's in-memory test harness under plain Node.
// The SDK imports the host ABI as `spacetime:sys@2.x`; its Vitest plugin stubs that import.
// This registers the same stub with a Node module hook, so the tests need no extra dependency.
import { registerHooks } from 'node:module';

const SYSCALLS = [
  'identity', 'get_jwt_payload', 'table_id_from_name', 'index_id_from_name',
  'datastore_table_row_count', 'datastore_table_scan_bsatn', 'datastore_insert_bsatn',
  'datastore_delete_all_by_eq_bsatn', 'datastore_index_scan_point_bsatn', 'datastore_index_scan_range_bsatn',
  'datastore_delete_by_index_scan_point_bsatn', 'datastore_delete_by_index_scan_range_bsatn',
  'datastore_update_bsatn', 'datastore_clear', 'row_iter_bsatn_advance', 'row_iter_bsatn_close',
  'procedure_start_mut_tx', 'procedure_commit_mut_tx', 'procedure_abort_mut_tx', 'procedure_http_request',
  'env_get', 'volatile_nonatomic_schedule_immediate',
];
const STUB = [
  "export const moduleHooks = Symbol.for('spacetimedb.moduleHooks');",
  "const unsupported = n => () => { throw new Error('unsupported host syscall in a unit test: ' + n); };",
  ...SYSCALLS.map(n => `export const ${n} = unsupported('${n}');`),
  'export const console_log = () => {};',
  'export const console_timer_start = () => 0;',
  'export const console_timer_end = () => {};',
].join('\n');

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('spacetime:sys@2.')) {
      return { url: `data:text/javascript,${encodeURIComponent(STUB)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

export async function loadModule() {
  const testUtils = await import('spacetimedb/server/test-utils');
  const sdk = await import('spacetimedb');
  const mod = await import('../src/index');
  const remediation = await import('../src/lib/remediation');
  const rules = await import('../src/lib/rules');
  return { testUtils, sdk, mod, remediation, rules };
}
