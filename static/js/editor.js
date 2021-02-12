/* fuzzy editor */

/*
// begin module
var editor = (function() {
*/

// hardcoded options
var max_per = 5; // maximum number of matches per result

// global states
var file = null; // current file relative path
var active = false; // is the right pane editor active?
var editing = null; // are we in editing mode?

// global ui elements
var fuzzy = null;
var results = null;
var output = null;
var body = null;
var title = null;
var tags = null;
var query = null;
var newdoc = null;
var delbox = null;

// tools
function is_editable(elem) {
    var tag = elem.tagName.toLowerCase();
    return (elem.getAttribute('contentEditable') || (tag == 'input') || (tag == 'textarea'));
}

function scroll_top() {
    output.scrollTop(0);
}

// scroll cell into view
var scrollSpeed = 100;
var scrollFudge = 100;
function ensure_visible(elem) {
    var res_top = results.offset().top;
    var cell_top = results.scrollTop() + elem.offset().top;
    var cell_bot = cell_top + elem.height();
    var page_top = results.scrollTop() + res_top;
    var page_bot = page_top + results.innerHeight();
    if (cell_top < page_top + 20) {
        results.stop();
        results.animate({scrollTop: cell_top - res_top - scrollFudge}, scrollSpeed);
    } else if (cell_bot > page_bot - 20) {
        results.stop();
        results.animate({scrollTop: cell_bot - res_top - results.innerHeight() + scrollFudge}, scrollSpeed);
    }
}

function set_cursor_beg(elem) {
    var node = elem.childNodes[0];
    var range = document.createRange();
    range.setStart(node, 0);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function set_cursor_end(elem) {
    var node = elem.childNodes[elem.childNodes.length-1];
    var range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function set_cursor_pos(elem, pos) {
    var node = elem.childNodes[0];
    var range = document.createRange();
    range.setStart(node, pos);
    range.setEnd(node, pos);
    var sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function get_line_len(line) {
    var text = line.textContent;
    if (text == '\n') {
        return 0;
    } else {
        return text.length;
    }
}

function get_cursor_pos(elem) {
    sel = window.getSelection();
    if (sel.rangeCount > 0) {
        var range0 = window.getSelection().getRangeAt(0);
        var range = range0.cloneRange();
        range.selectNodeContents(elem);
        range.setEnd(range0.endContainer, range0.endOffset);
        return range.toString().length;
    } else {
        return 0;
    }
}

function get_cursor_beg(elem) {
    var pos = get_cursor_pos(elem);
    return (pos == 0);
}

function get_cursor_end(elem) {
    var pos = get_cursor_pos(elem);
    var len = get_line_len(elem);
    return (pos == len);
}

function get_current_line() {
    var range = window.getSelection();
    var node = range.focusNode;
    var elem;
    if (node.nodeType == 1) {
        if (node == body[0]) {
            console.log('get_current_line: in main body');
            elem = body.children('.line').last()[0];
        } else {
            elem = node;
        }
    } else {
        elem = node.parentElement;
    }
    return $(elem).closest('.line')[0];
}

function make_line(text='') {
    var div = document.createElement('div');
    div.innerHTML = text || '\n';
    div.classList.add('line');
    return div;
}

function prepend_to_line(line, text) {
    if (line.textContent == '\n') {
        if (text.length > 0) {
            line.textContent = text;
        }
    } else {
        line.textContent = text + line.textContent;
    }
}

function append_to_line(line, text) {
    if (line.textContent == '\n') {
        if (text.length > 0) {
            line.textContent = text;
        }
    } else {
        line.textContent += text;
    }
}

function strip_newline(line) {
    var text = line.textContent;
    if (!text.endsWith('\n') || (text == '\n')) {
        return;
    }

    var pos = get_cursor_pos(line);
    line.textContent = text.slice(0, -1);
    set_cursor_pos(line, pos);
}

// this kills off highlighting within affected line
function insert_at_cursor(text) {
    var line = get_current_line();
    var pos = get_cursor_pos(line);

    var extra = line.textContent.slice(pos);
    if (pos == 0) {
        line.textContent = '\n';
    } else {
        line.textContent = line.textContent.slice(0, pos);
    }

    var div = line;
    text.split('\n').forEach((x, i) => {
        if (i == 0) {
            append_to_line(div, x);
            pos += x.length;
        } else {
            var next = make_line(x);
            pos = x.length;
            div.insertAdjacentElement('afterend', next);
            div = next;
        }
    });

    append_to_line(div, extra);
    set_cursor_pos(div, pos);
}

function intercept_paste(event) {
    // only get text data
    var text = event.originalEvent.clipboardData.getData('text');

    // insert new text
    if (text.length > 0) {
        insert_at_cursor(text);
        set_modified(true);
    }

    // stop normal paste
    event.preventDefault();
}

function remove_highlight(elem) {
    var match = $(elem).find('.match');
    if (match.length > 0) {
        var pos = get_cursor_pos(elem);
        elem.textContent = elem.textContent;
        set_cursor_pos(elem, pos);
    }
}

function delete_line(line, move) {
    var next;
    if (move == 'up') {
        next = line.previousElementSibling;
    } else if (move == 'down') {
        next = line.nextElementSibling;
    }
    if (next === null) {
        return null;
    }
    line.remove();
    if (move == 'up') {
        set_cursor_end(next);
    } else if (move == 'down') {
        set_cursor_beg(next);
    }
    return next;
}

function send_command(cmd, cont) {
    var msg = JSON.stringify({'cmd': cmd, 'content': cont});
    ws.send(msg);
    console.log('Sent: ' + cmd);
}

function select_entry(box) {
    $('.res_box').removeClass('selected');
    box.addClass('selected');
    ensure_visible(box);
    var newfile = box.attr('file');
    var query = box.attr('query');
    send_command('text', {'file': newfile, 'query': query});
}

function is_modified() {
    return fuzzy.hasClass('modified');
}

function set_modified(mod) {
    if (mod) {
        fuzzy.addClass('modified');
    } else {
        fuzzy.removeClass('modified');
    }
}

function ensure_active() {
    if (!active && editing) {
        title.attr('contentEditable', true);
        body.attr('contentEditable', true);
        fuzzy.addClass('active');
        active = true;
    }
}

function ensure_inactive() {
    if (active && editing) {
        title.empty();
        tags.empty();
        body.empty();
        title.attr('contentEditable', false);
        body.attr('contentEditable', false);
        fuzzy.removeClass('active');
        fuzzy.removeClass('modified');
        active = false;
    }
}

function render_entry(info) {
    var file = info['file'];
    var words = info['query'];
    var num = info['num'];
    var res = info['text'].slice(0, max_per);
    var box = $('<div>', {class: 'res_box', file: file, query: words, num: num});
    var title = $('<div>', {class: 'res_title', html: file + ' (' + num + ')'});
    var match = $.map(res, function(x) {
        return $('<div>', {class: 'res_match', html: x.join(': ')});
    });
    box.append(title);
    box.append(match);
    box.click(function(event) {
        select_entry(box);
        query.focus();
        return false;
    });
    return box;
}

function render_tag(label) {
    var img = $('<img>', {src: '/static/svg/redx.svg'});
    var lab = $('<span>', {class: 'tag_lab', html: label});
    var tag = $('<span>', {class: 'tag_box'});
    tag.append(lab);
    if (editing) {
        var del = $('<span>', {class: 'tag_del'});
        del.append(img);
        tag.append(del);
        del.click(function(event) {
            tag.remove();
            set_modified(true);
            body.focus();
        });
    }
    lab.click(function(event) {
        var text = '#' + lab.text();
        query.val(text);
        send_command('query', text);
        query.focus();
    });
    return tag;
}

function render_results(res) {
    results.empty();
    $(res).each(function(i, bit) {
        var box = render_entry(bit);
        results.append(box);
    });
}

function render_output(info) {
    ensure_active();
    title.text(info['title']); // to separate last title word and first tag word for spellcheck :)
    tags.empty();
    $(info['tags']).each(function(i, s) {
        tags.append(render_tag(s));
        tags.append(' ');
    });
    body.empty();
    info['body'].split('\n').forEach((x, i) => {
        body.append(make_line(x));
    });
}

function create_tag(box) {
    var tag = render_tag('');
    tags.append(tag);
    tags.append(' ');
    set_modified(true);
    var lab = tag.children(".tag_lab");
    var del = tag.children(".tag_del");
    lab.attr('contentEditable', 'true');
    set_cursor_end(lab[0]);
    lab.keydown(function(event) {
        if (event.key == 'Enter') {
            lab.attr('contentEditable', 'false');
            body.focus();
            if (!event.metaKey) {
                return false;
            }
        }
    });
    lab.focusout(function() {
        lab.attr('contentEditable', 'false');
    });
}

function decode_html(input) {
    var e = document.createElement('div');
    e.innerHTML = input;
    return e.textContent;
}

function save_output(box) {
    var tag = tags.find('.tag_lab').map(function(i, t) { return t.innerHTML; } ).toArray();
    var tit = title.text();
    var htm = body.children('div').map((i, x) => {
        return x.innerHTML == '\n' ? '' : x.innerHTML;
    }).toArray().join('\n');
    var bod = decode_html(htm);
    send_command('save', {'file': file, 'title': tit, 'tags': tag, 'body': bod, 'create': false});
    set_modified(false);
}

function create_websocket(first_time) {
    ws = new WebSocket(ws_con);

    ws.onopen = function() {
        console.log('websocket connected!');
    };

    ws.onmessage = function (evt) {
        var msg = evt.data;

        var json_data = JSON.parse(msg);
        if (json_data) {
            var cmd = json_data['cmd'];
            var cont = json_data['content'];
            console.log('Received: ' + cmd);
            if (cmd == 'results') {
                render_results(cont);
                results[0].scrollTop = 0;
            } else if (cmd == 'text') {
                render_output(cont);
                file = cont['file'];
                set_modified(false);
                scroll_top();
            } else if (cmd == 'rename') {
                var [k, v] = cont;
                $(`[file="${k}"]`).attr('file', v);
                if (file == k) {
                    file = v;
                }
            }
        }
    };

    ws.onclose = function() {
        console.log('websocket closing!');
        /*
        console.log('websocket closed, attempting to reconnect');
        setTimeout(function() {
            create_websocket(false);
        }, 1);
        */
    };
}

function connect_websocket(subpath)
{
    if ('MozWebSocket' in window) {
        WebSocket = MozWebSocket;
    }
    if ('WebSocket' in window) {
        ws_con = 'ws://' + window.location.host + '/__fuzzy/' + subpath;
        console.log(ws_con);
        create_websocket(true);
    } else {
        console.log('Sorry, your browser does not support websockets.');
    }
}

function disconnect_websocket()
{
    if (ws_con) {
        ws_con.close();
    }
}

function connect_handlers() {
    query.focus();

    query.keypress(function(event) {
        if (event.key == 'Enter') {
            var text = query.val();
            if (event.ctrlKey) {
                send_command('create', {'title': text});
                body.focus();
            } else {
                send_command('query', text);
            }
            return false;
        }
    });

    newdoc.click(function(event) {
        var text = query.val();
        send_command('create', {'title': text});
        body.focus();
    });

    delbox.click(function(event) {
        var ans = window.confirm('Are you sure you want to delete ' + file + '?');
        if (ans) {
            ensure_inactive();
            $('.res_box[file=' + file + ']').remove();
            send_command('delete', file);
        }
    });

    output.keypress(function(event) {
        if ((event.key == 'Enter') && event.shiftKey) {
            if (is_modified()) {
                save_output();
            }
            return false;
        } else if ((event.key == 'Enter') && event.ctrlKey) {
            if (active) {
                create_tag();
            }
        }
    });

    title.keydown(function(event) {
        if (event.key == 'Enter') {
            if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
                return false;
            }
        } else if ((event.key == 'PageDown') || (event.key == 'ArrowDown') || ((event.key == 'ArrowRight') && get_cursor_end(title[0]))) {
            set_cursor_beg(body[0]);
            output.scrollTop(0);
            return false;
        }
    });

    body.keydown(function(event) {
        if ((event.key == 'ArrowLeft') && get_cursor_beg(body[0])) {
            set_cursor_end(title[0]);
            output.scrollTop(0);
            return false;
        } else if (((event.key == 'PageUp') || (event.key == 'ArrowUp')) && get_cursor_beg(body[0])) {
            set_cursor_beg(title[0]);
            output.scrollTop(0);
            return false;
        } else if ((event.key == 'ArrowDown') && get_cursor_end(body[0])) {
            output.scrollTop(output.prop('scrollHeight'));
            return false;
        } else if ((event.key == 'Enter') && !event.shiftKey && !event.ctrlKey) {
            insert_at_cursor('\n');
            set_modified(true);
            return false;
        } else if (event.key == 'Backspace') {
            var line = get_current_line();
            var text = line.textContent;
            if (text == '\n') {
                delete_line(line, 'up');
                if (next !== null) {
                    set_modified(true);
                }
                return false;
            }
            if (get_cursor_beg(line)) {
                var next = delete_line(line, 'up');
                if (next !== null) {
                    var len = get_line_len(next);
                    append_to_line(next, text);
                    set_cursor_pos(next, len);
                    set_modified(true);
                }
                return false;
            }
            if (text.length == 1) {
                line.textContent = '\n';
                set_modified(true);
                return false;
            }
        } else if (event.key == 'Delete') {
            var line = get_current_line();
            var text = line.textContent;
            if (text == '\n') {
                var next = delete_line(line, 'down');
                if (next !== null) {
                    set_modified(true);
                }
                return false;
            }
            if (get_cursor_end(line)) {
                var len = get_cursor_pos(line);
                var next = delete_line(line, 'down');
                if (next !== null) {
                    prepend_to_line(next, text);
                    set_cursor_pos(next, len);
                    set_modified(true);
                }
                return false;
            }
            if (text.length == 1) {
                line.textContent = '\n';
                set_modified(true);
                return false;
            }
        } else if (!event.ctrlKey) {
            if (!(active && editing)) {
                return false;
            }
        }
    });

    // intercept paste and insert only text
    title.bind('paste', intercept_paste);
    body.bind('paste', intercept_paste);

    // detect modification
    output.bind('input', function(evt) {
        if (active && editing) {
            var line = get_current_line();
            remove_highlight(line);
            strip_newline(line);
            set_modified(true);
        }
    });

    $(document).unbind('keydown').bind('keydown', function(event) {
        if (event.key == 'Backspace') {
            if (!is_editable(event.target)) {
                console.log('rejecting editing key: ', event.target.tagName.toLowerCase());
                return false;
            }
        }
        if (event.target.id == 'query') {
            if (event.key == 'Tab') {
                if (!editing || !active) {
                    return false;
                } else {
                    title.focus();
                }
            }
            if ((event.key == 'ArrowUp') || (event.key == 'ArrowDown')) {
                var box = $('.res_box.selected');
                var other;
                if (event.key == 'ArrowDown') {
                    if (box.length == 0) {
                        other = $('.res_box:first-child');
                    } else {
                        other = box.next();
                    }
                } else if (event.key == 'ArrowUp') {
                    if (box.length == 0) {
                        return;
                    } else {
                        other = box.prev();
                    }
                }
                if (other.length > 0) {
                    select_entry(other);
                }
                return false;
            } else if (event.key == 'PageUp') {
                output.stop(true, true);
                output.animate({ scrollTop: output.scrollTop() - 300 }, 200);
                return false;
            } else if (event.key == 'PageDown') {
                output.stop(true, true);
                output.animate({ scrollTop: output.scrollTop() + 300 }, 200);
                return false;
            }
        } else {
            if (event.key == 'Tab') {
                query.focus();
                return false;
            }
        }
    });
}

function init(config) {
    fuzzy = $('#fuzzy');
    results = $('#results');
    output = $('#output');
    body = $('#body');
    title = $('#title');
    tags = $('#tags');
    query = $('#query');
    newdoc = $('#newdoc');
    delbox = $('#delbox');

    editing = config['editing'];
    if (editing) {
        fuzzy.addClass('editing');
    }

    connect_websocket(config['subpath']);
    connect_handlers();
}

/*
// public interface
return {
    init: init
}

// end module
})();
*/
