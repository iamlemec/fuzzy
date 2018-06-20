import os
import glob

for fpath in glob.glob('raw/*/*'):
    fdir, fname = os.path.split(fpath)
    fbase, fext = os.path.splitext(fname)
    lines = [s.strip() for s in open(fpath, encoding='latin1')]
    title = lines[0]
    body = '\n'.join(lines[1:]).strip()
    _, tag = os.path.split(fdir)
    text = f'!{title} #{tag}\n\n{body}'
    with open(f'docs/{tag}_{fbase}', 'w+') as fid:
        fid.write(text)
