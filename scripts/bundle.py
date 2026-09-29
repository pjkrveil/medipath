"""Create one HTML file; account features still require HTTPS and Supabase setup."""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
html = (root / 'dist/index.html').read_text()
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + (root / 'dist/styles.css').read_text() + '</style>')
names = ['holidays.js', 'core.js', 'config.js', 'vendor/supabase.js', 'cloud.js', 'account.js', 'app.js']
for name in names:
    html = html.replace(f'<script defer src="{name}"></script>', '')
scripts = '\n'.join((root / 'dist' / name).read_text().replace('</script', '<\\/script') for name in names)
html = html.replace('</body>', '<script>\n' + scripts + '\n</script></body>')
(root / 'MediPath.html').write_text(html)
print(root / 'MediPath.html')
