/* fuzzy editor */

// begin module
var editor = (function() {

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
    output[0].scrollTop = 0;
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
    var range = document.createRange();
    range.setStart(elem, 0);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function set_cursor_end(elem) {
    var range = document.createRange();
    range.selectNodeContents(elem);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function set_cursor_pos(elem, pos) {
    var range = document.createRange();
    range.setStart(elem, pos);
    range.setEnd(elem, pos);
    var sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
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
    var len = elem.textContent.length;
    return (pos == len);
}

function insert_at_cursor(text) {
    var btext = body.text();
    var pos = get_cursor_pos(body[0].firstChild);
    var text1 = btext.slice(0, pos) + text + btext.slice(pos);
    body.text(text1);
    var pos1 = pos + text.length;
    set_cursor_pos(body[0].firstChild, pos1);
}

function intercept_paste(event) {
    // only get text data
    var text = event.originalEvent.clipboardData.getData('text');

    // insert new text
    insert_at_cursor(text);
    normalize_cursor();

    // stop normal paste
    event.preventDefault();
}

function remove_highlight() {
    if (body.hasClass('highlight')) {
        var pos = get_cursor_pos(body[0]);
        body.text(body.text());
        set_cursor_pos(body[0].firstChild, pos);
        body.removeClass('highlight');
    }
}

function ensure_newline() {
    if (!body.text().endsWith('\n')) {
        var pos = get_cursor_pos(body[0]);
        body.text(body.text()+'\n');
        set_cursor_pos(body[0].firstChild, pos);
    }
}

function normalize_cursor() {
    if (!body.hasClass('highlight')) {
        ensure_newline();
    }

    // this has to world in highlight mode
    // where there may be multiple child nodes
    var pos = get_cursor_pos(body[0]);
    var len = body.text().length;
    if (pos == len) {
        var node = body[0].lastChild;
        var end = node.textContent.length;
        var goto = Math.max(0, end - 1);
        set_cursor_pos(node, goto);
    }
}

function cursor_stats() {
    var pos = get_cursor_pos(body[0]);
    var len = body[0].textContent.length;
    console.log(`${pos}/${len}`);
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

    title.html(info['title']); // to separate last title word and first tag word for spellcheck :)

    tags.empty();
    $(info['tags']).each(function(i, s) {
        tags.append(render_tag(s));
        tags.append(' ');
    });

    var text = info['body'];
    if (!text.endsWith('\n')) {
        text += '\n';
    }
    body.html(text);
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

function replace_newlines(text) {
    return text.replace(/<br>/g, '\n');
}

function decode_html(input) {
    var e = document.createElement('div');
    e.innerHTML = input;
    return e.textContent;
}

function save_output(box) {
    var tag = tags.find('.tag_lab').map(function(i, t) { return t.innerHTML; } ).toArray();
    var tit = title[0].innerText;
    var htm = body[0].innerHTML;
    var bod = decode_html(replace_newlines(htm));
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
                body.addClass('highlight');
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
            normalize_cursor();
            set_modified(true);
            return false;
        } else if (!event.ctrlKey) {
            if (!(active && editing)) {
                return false;
            }
        }
    });

    body.keyup(function(event) {
        if ((event.key == 'ArrowLeft') || (event.key == 'ArrowRight') || (event.key == 'ArrowUp') || (event.key == 'ArrowDown')) {
            normalize_cursor();
        }
    });

    // intercept paste and insert only text
    title.bind('paste', intercept_paste);
    body.bind('paste', intercept_paste);

    // detect modification
    body.bind('input', function() {
        if (active && editing) {
            set_modified(true);
            remove_highlight();
            normalize_cursor();
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

// public interface
return {
    init: init
}

// end module
})();
