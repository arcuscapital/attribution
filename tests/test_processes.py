"""Exercise the real Windows console and process lifetime behavior."""
import ctypes
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

DESKTOP = Path(__file__).resolve().parents[1] / 'desktop'
sys.path.insert(0, str(DESKTOP))
from arcus_attribution.processes import run_hidden


class HelperTests(unittest.TestCase):
    def test_output_input_and_exit_status(self):
        result = run_hidden([sys.executable, '-c',
            'import sys; print(sys.stdin.read().upper()); sys.stderr.write("detail"); sys.exit(7)'],
            input='hello', text=True, capture_output=True, timeout=10)
        self.assertEqual(result.stdout.strip(), 'HELLO')
        self.assertEqual(result.stderr, 'detail')
        self.assertEqual(result.returncode, 7)

    def test_timeout(self):
        with self.assertRaises(subprocess.TimeoutExpired):
            run_hidden([sys.executable, '-c', 'import time; time.sleep(30)'],
                       capture_output=True, timeout=.2)


@unittest.skipUnless(os.name == 'nt', 'Windows process lifecycle')
class WindowsTests(unittest.TestCase):
    def test_helpers_have_no_console_from_pythonw(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'console.json'
            code = f'''
import sys
from pathlib import Path
sys.path.insert(0, {str(DESKTOP)!r})
from arcus_attribution.processes import run_hidden
r = run_hidden([{sys.executable!r}, '-c', 'import ctypes; print(ctypes.windll.kernel32.GetConsoleWindow())'], capture_output=True, text=True, timeout=10)
Path({str(output)!r}).write_text(r.stdout)
'''
            result = subprocess.run([str(Path(sys.executable).with_name('pythonw.exe')), '-c', code], timeout=15)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(output.read_text().strip(), '0')

    def test_descendants_exit_on_normal_and_forced_owner_exit(self):
        from ctypes import wintypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.WaitForSingleObject.restype = wintypes.DWORD
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        for forced in (False, True):
            with self.subTest(forced=forced), tempfile.TemporaryDirectory() as tmp:
                ready = Path(tmp) / 'ready.json'
                release = Path(tmp) / 'release'
                grandchild = 'import time; time.sleep(30)'
                child = f'import subprocess,sys,time; p=subprocess.Popen([sys.executable,"-c",{grandchild!r}], creationflags=subprocess.CREATE_NO_WINDOW); print(p.pid,flush=True); time.sleep(30)'
                owner = f'''
import sys, subprocess, time, json
from pathlib import Path
sys.path.insert(0, {str(DESKTOP)!r})
from arcus_attribution.processes import protect_process_tree
protect_process_tree()
protect_process_tree()
p = subprocess.Popen([{sys.executable!r}, '-c', {child!r}], stdout=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
Path({str(ready)!r}).write_text(json.dumps([p.pid, int(p.stdout.readline())]))
while not Path({str(release)!r}).exists(): time.sleep(.02)
'''
                p = subprocess.Popen([sys.executable, '-c', owner], creationflags=subprocess.CREATE_NO_WINDOW)
                handles = []
                try:
                    deadline = time.monotonic() + 10
                    while not ready.exists() and p.poll() is None and time.monotonic() < deadline:
                        time.sleep(.05)
                    self.assertTrue(ready.exists(), 'owner did not start descendants')
                    for pid in json.loads(ready.read_text()):
                        handle = kernel.OpenProcess(0x100000, False, pid)
                        self.assertTrue(handle)
                        handles.append(handle)
                    if forced:
                        p.kill()
                    else:
                        release.touch()
                    p.wait(timeout=10)
                    if not forced:
                        self.assertEqual(p.returncode, 0)
                    for handle in handles:
                        self.assertEqual(kernel.WaitForSingleObject(handle, 5000), 0,
                                         'descendant survived updater exit')
                finally:
                    if p.poll() is None:
                        p.kill()
                    p.wait(timeout=10)
                    for handle in handles:
                        kernel.CloseHandle(handle)


if __name__ == '__main__':
    unittest.main()
