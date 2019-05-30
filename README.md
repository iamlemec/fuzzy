# Fuzzy

High performance note taking with fuzzy search. Powered by [fzf](https://github.com/junegunn/fzf) and Python.

<img alg="fuzzy" src="fuzzy.png" width="600"/>

# Installing

First install [fzf](https://github.com/junegunn/fzf) and make sure it's in your path. Then make sure you have `tornado` installed in Python. Finally, clone this repository locally.

# Running

To use Fuzzy in editing mode, run the command
```
python3 server.py --path=PATH --edit
```
where PATH is the directory in which your notes will be read from and stored (it should exist and can be non-empty). Head on over to `http://localhost:9020` to use.

The above will only be available locally. Add `--ip=0.0.0.0` to the command for non-local use. You can also specify which port to use with the `--port=PORT` option. For read-only mode, simply omit the `--edit` flag.
