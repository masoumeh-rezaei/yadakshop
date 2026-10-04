import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).with_name('deploy.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as tar:
        for name, content, kind in entries:
            member = tarfile.TarInfo(name)
            member.type = kind
            if kind == tarfile.REGTYPE:
                member.size = len(content)
                tar.addfile(member, io.BytesIO(content))
            else:
                member.linkname = '/etc/shadow' if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE) else ''
                tar.addfile(member)
    output.seek(0)
    return output

VALID = [('backend/dist/server.js', b'code', tarfile.REGTYPE),
         ('backend/package-lock.json', b'{}', tarfile.REGTYPE),
         ('backend/node_modules', b'', tarfile.DIRTYPE),
         ('panel/index.html', b'panel', tarfile.REGTYPE)]

class ArtifactSecurity(unittest.TestCase):
    def test_valid_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            deploy.unpack_artifact(archive(VALID), Path(directory))
            self.assertEqual((Path(directory) / 'backend/dist/server.js').read_bytes(), b'code')

    def test_dangerous_entries_rejected(self):
        entries = [('../outside', tarfile.REGTYPE), ('/etc/shadow', tarfile.REGTYPE),
                   ('backend/../../outside', tarfile.REGTYPE), ('backend/.env', tarfile.REGTYPE),
                   ('panel/.env.production', tarfile.REGTYPE), ('other/code', tarfile.REGTYPE),
                   ('backend/link', tarfile.SYMTYPE), ('backend/hard', tarfile.LNKTYPE),
                   ('backend/device', tarfile.CHRTYPE), ('backend\\outside', tarfile.REGTYPE)]
        for name, kind in entries:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    deploy.unpack_artifact(archive(VALID + [(name, b'x', kind)]), Path(directory))

    def test_duplicate_rejected(self):
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(ValueError):
            deploy.unpack_artifact(archive(VALID + [VALID[0]]), Path(directory))

    def test_incomplete_rejected(self):
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(ValueError):
            deploy.unpack_artifact(archive(VALID[:-1]), Path(directory))

class TransactionSecurity(unittest.TestCase):
    def test_disconnected_ssh_cannot_break_coordinator_logging(self):
        with patch('builtins.print', side_effect=BrokenPipeError), \
             patch.object(deploy, 'silence_stdout') as silence:
            deploy.log('Recovery must continue')
            silence.assert_called_once()

    def test_interruption_is_not_swallowed_as_a_readiness_retry(self):
        with patch.object(deploy, 'runtime_check', side_effect=deploy.DeploymentInterrupted('hangup')):
            with self.assertRaises(deploy.DeploymentInterrupted):
                deploy.wait_check(Path('/unused'))

    def test_failed_activation_restores_state_and_panel(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old = root / ('a' * 40); old.mkdir()
            new = root / ('b' * 40); new.mkdir()
            state_file = root / 'state.json'; pending_file = root / 'pending.json'
            state = {'current_release': old.name, 'current_sha': old.name}
            deploy.atomic_json(state_file, state)
            published = []; selected = []
            def verify(path):
                if path == new: raise RuntimeError('Simulated failed health')
            with patch.object(deploy, 'STATE', state_file), patch.object(deploy, 'PENDING', pending_file), \
                 patch.object(deploy, 'release_path', lambda name: root / name), \
                 patch.object(deploy, 'set_current', lambda path: selected.append(path)), \
                 patch.object(deploy, 'publish', lambda path: published.append(path)), \
                 patch.object(deploy, 'run', lambda *args, **kwargs: ''), \
                 patch.object(deploy, 'wait_check', verify):
                with self.assertRaises(RuntimeError): deploy.activate(new, state)
            self.assertEqual(published, [new, old])
            self.assertEqual(selected, [new, old])
            self.assertEqual(json.loads(state_file.read_text()), state)
            self.assertFalse(pending_file.exists())

    def test_failed_restore_keeps_recovery_journal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); pending = root / 'pending.json'
            old = root / ('a' * 40); old.mkdir()
            new = root / ('b' * 40); new.mkdir()
            state = {'current_release': old.name, 'current_sha': old.name}
            with patch.object(deploy, 'PENDING', pending), \
                 patch.object(deploy, 'release_path', lambda name: root / name), \
                 patch.object(deploy, 'set_current', lambda path: None), \
                 patch.object(deploy, 'publish', side_effect=RuntimeError('Simulated publish failure')):
                with self.assertRaises(RuntimeError): deploy.activate(new, state)
            self.assertTrue(pending.exists())
            self.assertEqual(json.loads(pending.read_text())['old_release'], old.name)

if __name__ == '__main__': unittest.main(verbosity=2)
