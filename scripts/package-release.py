"""Create a cPanel upload ZIP with explicit safe Unix permissions."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
from datetime import datetime, timezone
import hashlib
import sys

project = Path(__file__).resolve().parents[1]
source = project / 'dist'
stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
destination = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else project.parent / ('observatory-release-' + stamp + '.zip')
if source in destination.parents:
    raise SystemExit('Write the release outside dist/.')
files = sorted(p for p in source.rglob('*') if p.is_file())
with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
    for path in files:
        if path.is_symlink() or path.suffix.lower() in {'.mmdb','.gz','.zip','.log','.env','.bak'} or (path.name.startswith('.') and path.name != '.htaccess'):
            raise SystemExit('Unexpected deployment file: ' + path.name)
        item = ZipInfo('observatory/' + path.relative_to(source).as_posix())
        item.create_system = 3
        item.external_attr = (0o100644 << 16)
        item.compress_type = ZIP_DEFLATED
        archive.writestr(item, path.read_bytes())
with ZipFile(destination) as archive:
    assert all((item.external_attr >> 16) & 0o777 == 0o644 for item in archive.infolist())
print(str(destination))
print('Files:', len(files), 'SHA256:', hashlib.sha256(destination.read_bytes()).hexdigest())
