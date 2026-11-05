-- Optional performance tuning, not a required application schema migration.
-- Run manually after reviewing the query plan and scheduling the index build.
-- Idempotent: reuse any existing index beginning with these two columns.
SET @history_index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics first_column
  JOIN information_schema.statistics second_column
    ON second_column.table_schema = first_column.table_schema
    AND second_column.table_name = first_column.table_name
    AND second_column.index_name = first_column.index_name
  WHERE first_column.table_schema = DATABASE()
    AND first_column.table_name = 'locations'
    AND first_column.seq_in_index = 1 AND first_column.column_name = 'user_id'
    AND second_column.seq_in_index = 2 AND second_column.column_name = 'recorded_at'
);
SET @history_index_sql = IF(@history_index_exists > 0, 'SELECT 1',
  'CREATE INDEX idx_locations_user_recorded_at ON locations (user_id, recorded_at)');
PREPARE history_index_statement FROM @history_index_sql;
EXECUTE history_index_statement;
DEALLOCATE PREPARE history_index_statement;
