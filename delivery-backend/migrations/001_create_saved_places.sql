CREATE TABLE IF NOT EXISTS saved_places (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  source_key VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_saved_places_source_key (source_key),
  KEY idx_saved_places_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO saved_places (name, latitude, longitude, source_key) VALUES
  ('شهرام', 35.6885637, 51.4320954, 'neshan-rbvEiPQximO6'),
  ('باران', 35.6889207, 51.4294639, 'neshan-rbvEp45xiNZ9'),
  ('نظری', 35.6902480, 51.4268213, 'neshan-rbvED-Yxilyw'),
  ('جواد', 35.6873622, 51.4305984, 'neshan-rbvEBLWxi6UY'),
  ('اشکان', 35.6909948, 51.4266747, 'neshan-rbvgY3yxilLt'),
  ('فرامرزی', 35.6872698, 51.4269581, 'neshan-rbvE5FOxiagZ'),
  ('حامد', 35.6868549, 51.4286876, 'neshan-rbvEW5QxiqQ5'),
  ('دفتر', 35.6946383, 51.4312891, 'neshan-rbvgV5IxiIut'),
  ('انبار', 35.6885483, 51.4301668, 'neshan-rbvEOmpxiDtV')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  latitude = VALUES(latitude),
  longitude = VALUES(longitude);
