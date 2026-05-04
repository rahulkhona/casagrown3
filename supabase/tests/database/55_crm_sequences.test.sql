BEGIN;
SELECT plan(15);

-- 1. Check Tables Exist
SELECT has_table('crm_sequences', 'Table crm_sequences should exist');
SELECT has_table('crm_sequence_enrollments', 'Table crm_sequence_enrollments should exist');

-- 2. Check Columns
SELECT has_column('crm_sequences', 'status', 'crm_sequences should have status column');
SELECT has_column('crm_sequences', 'definition', 'crm_sequences should have definition JSONB column');
SELECT has_column('crm_sequence_enrollments', 'current_node_id', 'crm_sequence_enrollments should have current_node_id');
SELECT has_column('crm_sequence_enrollments', 'next_evaluation_at', 'crm_sequence_enrollments should have next_evaluation_at');
SELECT has_column('crm_campaign_sends', 'sequence_id', 'crm_campaign_sends should have sequence_id');
SELECT has_column('crm_campaign_sends', 'node_id', 'crm_campaign_sends should have node_id');

-- 3. Check Constraints (Defaults, Nullability)
SELECT col_default_is('crm_sequences', 'status', 'draft', 'Status default is draft');
SELECT col_not_null('crm_sequences', 'definition', 'Definition must not be null');

-- 4. Check Unique Enrollment Constraint
INSERT INTO crm_sequences (id, name, status) VALUES ('d8a39a26-9f8a-4c28-bb8c-686940f8b111', 'Test Sequence', 'active');

-- First enrollment should succeed
INSERT INTO crm_sequence_enrollments (sequence_id, recipient_type, recipient_id, current_node_id)
VALUES ('d8a39a26-9f8a-4c28-bb8c-686940f8b111', 'lead', 'd8a39a26-9f8a-4c28-bb8c-686940f8b222', 'start');

SELECT throws_ok(
  $$
    INSERT INTO crm_sequence_enrollments (sequence_id, recipient_type, recipient_id, current_node_id)
    VALUES ('d8a39a26-9f8a-4c28-bb8c-686940f8b111', 'lead', 'd8a39a26-9f8a-4c28-bb8c-686940f8b222', 'start2')
  $$,
  '23505',
  NULL,
  'Enrolling the same recipient twice in the same sequence should fail'
);

-- 5. Check crm_campaign_sends constraints
SELECT throws_ok(
  $$
    INSERT INTO crm_campaign_sends (recipient_type, recipient_id) VALUES ('lead', 'd8a39a26-9f8a-4c28-bb8c-686940f8b222')
  $$,
  '23514',
  NULL,
  'crm_campaign_sends should fail if both campaign_id and sequence_id are null'
);

-- Valid insert with sequence_id only
INSERT INTO crm_campaign_sends (sequence_id, recipient_type, recipient_id)
VALUES ('d8a39a26-9f8a-4c28-bb8c-686940f8b111', 'lead', 'd8a39a26-9f8a-4c28-bb8c-686940f8b222');

SELECT results_eq(
  $$ SELECT count(*)::int FROM crm_campaign_sends WHERE sequence_id = 'd8a39a26-9f8a-4c28-bb8c-686940f8b111' $$,
  ARRAY[1],
  'Valid sequence send should insert successfully'
);

-- 6. Check Cascading Deletes
DELETE FROM crm_sequences WHERE id = 'd8a39a26-9f8a-4c28-bb8c-686940f8b111';

SELECT results_eq(
  $$ SELECT count(*)::int FROM crm_sequence_enrollments WHERE sequence_id = 'd8a39a26-9f8a-4c28-bb8c-686940f8b111' $$,
  ARRAY[0],
  'Sequence enrollments should cascade delete'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM crm_campaign_sends WHERE sequence_id = 'd8a39a26-9f8a-4c28-bb8c-686940f8b111' $$,
  ARRAY[0],
  'Campaign sends for sequence should cascade delete'
);

SELECT * FROM finish();
ROLLBACK;
