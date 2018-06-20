import os
import glob
import shutil
import numpy as np

nsamp = 50
state = np.random.RandomState(94395245)

# convert to fuzzy format and flatten
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

# draw random sample of 100 articles
articles = glob.glob('docs/*')
for fpath in state.choice(articles, size=nsamp, replace=False):
    fdir, fname = os.path.split(fpath)
    shutil.copy2(fpath, f'docs1/{fname}')
