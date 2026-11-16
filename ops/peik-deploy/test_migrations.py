import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('migrations', Path(__file__).with_name('migrations.py'))
migrations = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migrations)


class MigrationBackup(unittest.TestCase):
    def test_backup_failure_prevents_sql_execution(self):
        with patch.object(migrations, 'command', return_value=json.dumps({'pending': ['003.sql'], 'baseline': []})) as command, \
             patch.object(migrations, 'backup', side_effect=RuntimeError('Dump failed')):
            with self.assertRaisesRegex(RuntimeError, 'Dump failed'):
                migrations.migrate_release(Path('/unused/backend'))
            self.assertEqual(command.call_count, 1)

    def test_repeated_deploy_checks_history_without_redundant_backup(self):
        with patch.object(migrations, 'command', side_effect=[json.dumps({'pending': [], 'baseline': []}), None]) as command, \
             patch.object(migrations, 'backup') as backup:
            migrations.migrate_release(Path('/unused/backend'))
            backup.assert_not_called()
            self.assertEqual(command.call_count, 2)


if __name__ == '__main__': unittest.main()
