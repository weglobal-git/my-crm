import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toPipelineActor,
  resolveAccessContext,
  type AccessContext,
} from './access-context';
import { requireOpportunityAccess } from '@/lib/pipeline-security';

test('access-context A2: toPipelineActor correctly converts AccessContext', () => {
  const context: AccessContext = {
    userId: 'user-1',
    name: 'Somchai',
    role: 'GENERAL',
    departments: ['Export'],
    departmentIds: ['dept-export-1'],
    hasPipelineAccess: true,
  };

  const actor = toPipelineActor(context);
  assert.equal(actor.id, 'user-1');
  assert.equal(actor.name, 'Somchai');
  assert.equal(actor.role, 'GENERAL');
  assert.deepEqual(actor.departments, ['Export']);
  assert.deepEqual(actor.departmentIds, ['dept-export-1']);
});

test('access-context A2: resolveAccessContext takes zero parameters (server session authority)', () => {
  assert.equal(resolveAccessContext.length, 0, 'resolveAccessContext must not accept actorOverride');
});

test('access-context A2: requireOpportunityAccess rejects users without pipeline access when passing context', async () => {
  const contextWithoutAccess: AccessContext = {
    userId: 'user-2',
    name: 'NoAccess',
    role: 'GENERAL',
    departments: ['Accounting'],
    departmentIds: ['dept-acc-1'],
    hasPipelineAccess: false,
  };

  await assert.rejects(
    async () => {
      await requireOpportunityAccess('opp-1', { context: contextWithoutAccess });
    },
    /Forbidden/,
    'Should throw Forbidden when hasPipelineAccess is false'
  );
});
