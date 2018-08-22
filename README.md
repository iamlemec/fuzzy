# Fuzzy

High performance note taking with fuzzy search. Powered by [fzf](https://github.com/junegunn/fzf) and Python.

# Running

To use Fuzzy in editing mode, run the command
```
python3 server.py --path=PATH --edit
```
where PATH is the directory in which your notes will be read from and stored (it should exist and can be non-empty). Head on over to `http://localhost:9020` to use.

The above will only be available locally. Add `--ip=0.0.0.0` to the command for non-local use. You can also specify which port to use with the `--port=PORT` option. For read-only mode, simply omit the `--edit` flag.
