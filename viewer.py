import os
import json
import operator
import random
import shutil
import argparse
import traceback
import subprocess as sub
import shutil
from collections import OrderedDict

import tornado.ioloop
import tornado.web
import tornado.websocket

# parse input arguments
parser = argparse.ArgumentParser(description='Fuzzy Server.')
parser.add_argument('--path', type=str, help='location of files')
parser.add_argument('--ip', type=str, default='127.0.0.1', help='ip address to listen on')
parser.add_argument('--port', type=int, default=9020, help='port to serve on')
parser.add_argument('--tag', type=str, default='#', help='tag indicator')
parser.add_argument('--sep', action='store_true', help='put tags on next line')
parser.add_argument('--head', type=str, default='!', help='header indicator (on write)')
parser.add_argument('--edit', action='store_true', help='enable editing mode (experimental)')
parser.add_argument('--demo', action='store_true', help='enable demo mode')
parser.add_argument('--auth', type=str, default=None)
args = parser.parse_args()

# hardcoded
tmp_dir = 'temp'
max_len = 90
max_res = 100
max_per = 5

# search tools
cmd = 'ag --follow --nobreak --noheading ".+" "%(path)s" | fzf -f "%(words)s" | head -n %(max_res)d'
normpath = os.path.normpath(args.path)

# randomization
rand_hex = lambda: hex(random.getrandbits(128))[2:].zfill(32)

# authentication
if args.auth is not None:
    with open(args.auth) as fid:
      auth = json.load(fid)
    cookie_secret = auth['cookie_secret']
    username_true = auth['username']
    password_true = auth['password']
    def authenticated(get0):
        def get1(self, *args):
            current_user = self.get_secure_cookie('user')
            if not current_user:
                self.redirect('/__login/')
                return
            get0(self, *args)
        return get1
else:
    cookie_secret = None
    def authenticated(get0):
        return get0

# utils
def validate_path(relpath, weak=False):
    absbase = os.path.abspath(normpath)
    abspath = os.path.abspath(os.path.join(absbase, relpath))
    prefix = os.path.normpath(os.path.commonprefix([abspath, absbase]))
    op = operator.ge if weak else operator.gt
    return (prefix == absbase) and op(len(abspath), len(absbase))

# searching
def make_result(fpath, info):
    return {
        'file': fpath,
        'num': len(info),
        'text': [f'{i}: {t}' for i, t in info[:max_per]]
    }

def search(words, block=True):
    query = cmd % dict(path=normpath, words=words, max_res=max_res)
    with sub.Popen(query, shell=True, stdout=sub.PIPE) as proc:
        outp, _ = proc.communicate()
    infodict = OrderedDict()
    for line in outp.decode().split('\n'):
        if len(line) > 0:
            fpath, line, text = line.split(':', maxsplit=2)
            if not validate_path(fpath):
                continue
            frela = os.path.relpath(fpath, normpath)
            if len(text) > max_len - 3:
                text = text[:max_len-3] + '...'
            infodict.setdefault(frela, []).append((line, text))
    return [make_result(frela, info) for frela, info in infodict.items()]

# input
def load_file(fpath):
    with open(fpath) as fid:
        text = fid.read()
    if args.sep:
        title, rest = bsplit(text)
        if rest.lstrip().startswith(args.tag):
            tags, body = bsplit(rest.lstrip())
            tags = [s[1:] for s in tags.split() if s.startswith(args.tag)]
        else:
            body = rest
            tags = []
        body = body[1:] if body.startswith('\n') else body
    else:
        if text.startswith('#!'):
            text = text[2:].lstrip()
        else:
            text = text[1:].lstrip()
        head, body = bsplit(text)
        head = head.split()
        title = ' '.join([s for s in head if not s.startswith(args.tag)])
        tags = [s[1:] for s in head if s.startswith(args.tag)]
        body = body[1:] if body.startswith('\n') else body
    return {'title': title, 'tags': tags, 'body': body}

# output
def save_file(fpath0, info):
    tags = ' '.join([args.tag + t for t in info['tags']])
    text = args.head + ' ' + info['title'] + ' ' + tags + '\n\n' + info['body']

    rpath, fname0 = os.path.split(fpath0)
    fname = fname0
    fdest = os.path.join(normpath, rpath, fname)

    if info['create']:
        idx = 0
        while os.path.exists(fdest):
            idx += 1
            tag = '' if idx == 0 else f'_{idx}'
            fname = fname0 + tag
            fdest = os.path.join(normpath, rpath, fname)

    tpath = os.path.join(tmp_dir, rpath, fname)

    fid = open(tpath, 'w+')
    fid.write(text)
    fid.close()
    shutil.move(tpath, fdest)

def delete_file(fname):
    if validate_path(fname) and not os.path.isdir(fname):
        fpath = os.path.join(normpath, fname)
        os.remove(fpath)
    else:
        print('Invalid path: %s' % fname)

# text tools
def bsplit(s, sep='\n'):
    if sep not in s:
        return s, ''
    else:
        return s.split(sep, maxsplit=1)

# authorization handlers
class AuthLoginHandler(tornado.web.RequestHandler):
    def get(self):
        try:
            errormessage = self.get_argument('error')
        except:
            errormessage = ''
        self.render('login.html', errormessage=errormessage)

    def check_permission(self, password, username):
        if username == username_true and password == password_true:
            return True
        return False

    def post(self):
        username = self.get_argument('username', '')
        password = self.get_argument('password', '')
        auth = self.check_permission(password, username)
        if auth:
            self.set_current_user(username)
            self.redirect('/')
        else:
            error_msg = '?error=' + tornado.escape.url_escape('Login incorrect')
            self.redirect('/__login/' + error_msg)

    def set_current_user(self, user):
        if user:
            print(user)
            self.set_secure_cookie('user', tornado.escape.json_encode(user))
        else:
            self.clear_cookie('user')

class AuthLogoutHandler(tornado.web.RequestHandler):
    def get(self):
        self.clear_cookie('user')
        self.redirect(self.get_argument('next', '/'))

class EditorHandler(tornado.web.RequestHandler):
    @authenticated
    def get(self, subpath):
        self.render('editor.html', editing=args.edit, subpath=subpath)

class DemoHandler(tornado.web.RequestHandler):
    def get(self):
        drand = rand_hex()
        fullpath = os.path.join(normpath, drand)
        os.mkdir(fullpath)
        shutil.copy(os.path.join('testing', 'testing'), fullpath)
        self.redirect('/%s' % drand)

class FuzzyHandler(tornado.websocket.WebSocketHandler):
    def initialize(self):
        print('initializing')

    def allow_draft76(self):
        return True

    def open(self, subpath):
        print('connection received: %s' % subpath)
        if args.demo and subpath == '':
            print('cannot do top level in demo')
            self.close(code=401, reason='no permissions in demo mode')
        self.subpath = subpath
        self.fullpath = os.path.normpath(os.path.join(normpath, subpath))
        if not validate_path(self.fullpath, weak=True):
            print('invalid subpath')
            self.close(code=401, reason='invalid subpath')

    def on_close(self):
        print('connection closing')

    def error_msg(self, error_code):
        if error_code is not None:
            json_string = json.dumps({'type': 'error', 'code': error_code})
            self.write_message(json_string)
        else:
            print('error code not found')

    def write_json(self, js):
        self.write_message(json.dumps(js))

    @authenticated
    def on_message(self, msg):
        data = json.loads(msg)
        cmd, cont = data['cmd'], data['content']

        if cmd == 'query':
            try:
                print('Query: %s' % cont)
                ret = list(search(cont))
                self.write_json({'cmd': 'results', 'content': ret})
            except Exception as e:
                print(e)
                print(traceback.format_exc())
        elif cmd == 'text':
            try:
                print('Loading: %s' % cont)
                fpath = os.path.join(normpath, cont)
                info = load_file(fpath)
                self.write_json({'cmd': 'text', 'content': dict(file=cont, **info)})
            except Exception as e:
                print(e)
                print(traceback.format_exc())
        elif cmd == 'save':
            if not args.edit:
                print('Edit attempt in read-only mode!')
                return
            try:
                fname = cont.pop('file')
                print('Saving: %s' % fname)
                save_file(fname, cont)
            except Exception as e:
                print(e)
                print(traceback.format_exc())
        elif cmd == 'delete':
            if not args.edit:
                print('Edit attempt in read-only mode!')
                return
            try:
                fname = cont['file']
                print('Delete: %s' % fname)
                delete_file(fname)
            except Exception as e:
                print(e)
                print(traceback.format_exc())

# tornado content handlers
class Application(tornado.web.Application):
    def __init__(self):
        handlers = [
            (r'/__fuzzy/(.*)', FuzzyHandler),
            (r'/__login/?', AuthLoginHandler),
            (r'/__logout/?', AuthLogoutHandler),
        ]
        if args.demo:
            handlers += [
                (r'/?', DemoHandler),
                (r'/(.+)/?', EditorHandler)
            ]
        else:
            handlers += [
                (r'/(.*)/?', EditorHandler)
            ]
        settings = dict(
            app_name='Fuzzy Editor',
            template_path='templates',
            static_path='static',
            cookie_secret=cookie_secret
        )
        tornado.web.Application.__init__(self, handlers, debug=True, **settings)

# create server
application = Application()
application.listen(args.port, address=args.ip)
tornado.ioloop.IOLoop.current().start()
