-- Optional instructions travel with each assignment, including completed tasks.
-- Keep this migration safe to rerun without changing existing assignments.
SET @task_description_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'driver_tasks' AND column_name = 'description'
);
SET @task_description_sql = IF(
  @task_description_exists = 0,
  'ALTER TABLE driver_tasks ADD COLUMN description TEXT NULL AFTER assigned_by',
  'SELECT 1'
);
PREPARE task_description_statement FROM @task_description_sql;
EXECUTE task_description_statement;
DEALLOCATE PREPARE task_description_statement;
