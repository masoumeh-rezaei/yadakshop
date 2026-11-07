-- Required schema: persistent courier/place assignments. Review and apply before deployment.
-- Match existing users.id exactly, including signedness, rather than assuming its type.
SET @task_user_id_type = (
  SELECT column_type FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'id'
    AND data_type IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint')
);
SET @task_place_id_type = (
  SELECT column_type FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'saved_places' AND column_name = 'id'
    AND data_type IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint')
);
SET @task_table_sql = CONCAT(
  'CREATE TABLE IF NOT EXISTS driver_tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    driver_id ', @task_user_id_type, ' NOT NULL,
    place_id ', @task_place_id_type, ' NOT NULL,
    assigned_by ', @task_user_id_type, ' NULL,
    status ENUM(''pending'', ''completed'', ''cancelled'') NOT NULL DEFAULT ''pending'',
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_driver_tasks_pair (driver_id, place_id),
    KEY idx_driver_tasks_driver_status (driver_id, status, assigned_at),
    KEY idx_driver_tasks_place_status (place_id, status),
    CONSTRAINT fk_driver_tasks_driver FOREIGN KEY (driver_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_driver_tasks_place FOREIGN KEY (place_id) REFERENCES saved_places (id) ON DELETE CASCADE,
    CONSTRAINT fk_driver_tasks_assigner FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE task_table_statement FROM @task_table_sql;
EXECUTE task_table_statement;
DEALLOCATE PREPARE task_table_statement;
