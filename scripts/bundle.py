"""Create a dependency-free single HTML deliverable from the same app sources."""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
html = (root / 'dist/index.html').read_text()
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + (root / 'dist/styles.css').read_text() + '</style>')
for name in ['holidays.js', 'core.js', 'app.js']:
    html = html.replace(f'<script defer src="{name}"></script>', '')
scripts = '\n'.join((root / 'dist' / name).read_text() for name in ['holidays.js', 'core.js', 'app.js'])
html = html.replace('</body>', '<script>\n' + scripts + '\n</script></body>')
(root / 'MediPath.html').write_text(html)
print(root / 'MediPath.html')
