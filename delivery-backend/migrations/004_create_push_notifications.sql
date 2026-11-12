-- Devices and an assignment outbox; retries survive API process restarts.
SET @push_user_id_type = (
  SELECT column_type FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'id'
);
SET @push_devices_sql = CONCAT(
  'CREATE TABLE IF NOT EXISTS push_devices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id ', @push_user_id_type, ' NOT NULL,
    expo_token VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    platform ENUM(''android'', ''ios'') NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_push_device_token (expo_token),
    KEY idx_push_devices_user (user_id, updated_at),
    CONSTRAINT fk_push_devices_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE push_devices_statement FROM @push_devices_sql;
EXECUTE push_devices_statement;
DEALLOCATE PREPARE push_devices_statement;

CREATE TABLE IF NOT EXISTS task_push_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  task_revision INT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  state ENUM('pending', 'receipt', 'done', 'failed') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_until DATETIME NULL,
  lease_id CHAR(36) NULL,
  ticket_id VARCHAR(128) NULL,
  last_error VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_task_push_delivery (task_id, task_revision, device_id),
  KEY idx_task_push_ready (state, available_at, locked_until),
  CONSTRAINT fk_task_push_job_task FOREIGN KEY (task_id) REFERENCES driver_tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_task_push_job_device FOREIGN KEY (device_id) REFERENCES push_devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
