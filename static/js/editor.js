// Why!?!
Array.prototype.contains = function(obj) {
    var i = this.length;
    while (i--) {
        if (this[i] === obj) {
            return true;
        }
    }
    return false;
}

// escaping
function strip_tags(html) {
    return html.replace(/\n/g, '')
               .replace(/<div ?.*?>/g, '')
               .replace(/<br>/g, '')
               .replace(/<span ?.*?>/g, '')
               .replace(/<\/span>/g, '')
               .replace(/<\/div>/g, '\n');
};

function is_editable(element) {
    return (event.target.getAttribute('contentEditable') || (event.target.tagName.toLowerCase() == 'input'));
}

function scroll_top() {
    output[0].scrollTop = 0;
}

// scroll cell into view
var scrollSpeed = 100;
var scrollFudge = 100;
function ensure_visible(element) {
    var res_top = results.offset().top;
    var cell_top = results.scrollTop() + element.offset().top;
    var cell_bot = cell_top + element.height();
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

function set_caret_at_beg(element) {
    var range = document.createRange();
    range.setStart(element, 0);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function set_caret_at_end(element) {
    element.focus();
    var range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function select_all(element) {
    element.focus();
    var range = document.createRange();
    range.selectNodeContents(element);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function set_caret_at_pos(element, pos) {
    var range = document.createRange();
    range.setStart(element, pos);
    range.setEnd(element, pos);
    var sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function get_caret_position(element) {
    sel = window.getSelection();
    if (sel.rangeCount > 0) {
        var range = window.getSelection().getRangeAt(0);
        var preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        caretOffset = preCaretRange.toString().length;
        return caretOffset;
    } else {
        return 0;
    }
}

function is_caret_at_beg(element) {
    var cpos = get_caret_position(element);
    return (cpos == 0);
}

function is_caret_at_end(element) {
    var cpos = get_caret_position(element);
    var tlen = element.textContent.length;
    return (cpos == tlen);
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
    if (newfile == file) {
        return;
    }
    send_command('text', newfile);
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
    if (!active) {
        title.attr('contentEditable', true);
        body.attr('contentEditable', true);
        active = true;
    }
}

function render_entry(info) {
    var name = '<span class="res_name">' + info['file'] + ' - ' + info['line'] + '</span>';
    var text = info['text'];
    var box = $('<div>', {class: 'res_box', file: info['file'], line: info['line']});
    var span = $('<span>', {class: 'res_title', html: name + '<br/>' + text});
    box.append(span);
    box.click(function(event) {
        select_entry(box);
    });
    return box;
}

function render_tag(label) {
    var lab = $('<span>', {class: 'tag_lab', html: label});
    var del = $('<span>', {class: 'tag_del', html: '&#x2716;'});
    var tag = $('<span>', {class: 'tag_box'});
    tag.append(lab);
    tag.append(del);
    del.click(function(event) {
        tag.remove();
        set_modified(true);
        body.focus();
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
    title.html(info['title']);
    tags.empty();
    $(info['tags']).each(function(i, s) {
        tags.append(render_tag(s));
        tags.append(' ');
    });
    body.empty();
    $(info['body'].split('\n')).each(function(i, s) {
        body.append($('<div>', {text: s}));
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
    set_caret_at_end(lab[0]);
    lab.keydown(function(event) {
        if (event.keyCode == 13) {
            lab.attr('contentEditable', 'false');
            body.focus();
            if (!event.metaKey) {
                event.preventDefault();
            }
        }
    });
    lab.focusout(function() {
        lab.attr('contentEditable', 'false');
    });
}

function create_websocket(first_time) {
    ws = new WebSocket(ws_con);

    ws.onopen = function() {
        console.log('websocket connected!');
    };

    ws.onmessage = function (evt) {
        var msg = evt.data;
        // console.log('Received: ' + msg);

        var json_data = JSON.parse(msg);
        if (json_data) {
            var cmd = json_data['cmd'];
            var cont = json_data['content'];
            if (cmd == 'results') {
                render_results(cont);
                results[0].scrollTop = 0;
            } else if (cmd == 'text') {
                render_output(cont);
                file = cont['file'];
                set_modified(false);
                scroll_top();
            }
        }
    };

    ws.onclose = function() {
        console.log('websocket closed, attempting to reconnect');
        setTimeout(function() {
            create_websocket(false);
        }, 1);
    };
}

function connect()
{
    if ('MozWebSocket' in window) {
        WebSocket = MozWebSocket;
    }
    if ('WebSocket' in window) {
        ws_con = 'ws://' + window.location.host + '/fuzzy';
        console.log(ws_con);
        create_websocket(true);
    } else {
        console.log('Sorry, your browser does not support websockets.');
    }
}

function disconnect()
{
    ws.onclose = function() {
        console.log('websocket closed, attempting to reconnect');
        setTimeout(function() {
            create_websocket(false);
        }, 1);
    };
}

function connect()
{
    if ('MozWebSocket' in window) {
        WebSocket = MozWebSocket;
    }
    if ('WebSocket' in window) {
        ws_con = 'ws://' + window.location.host + '/fuzzy';
        console.log(ws_con);
        create_websocket(true);
    } else {
        console.log('Sorry, your browser does not support websockets.');
    }
}

function disconnect()
{
    if (ws) {
        ws.close();
    }
}

function save_output(box) {
    var tit = title.text();
    var tag = tags.find('.tag_lab').map(function(i, t) { return t.innerHTML; } ).toArray();
    var bod = strip_tags(body.html());
    if (bod.endsWith('\n')) {
        bod = bod.slice(0, -1);
    }
    if (file == null) {
        file = tit.toLowerCase().replace(/\W/g, '_');
    }
    send_command('save', {'file': file, 'title': tit, 'tags': tag, 'body': bod});
    set_modified(false);
}

$(document).ready(function () {
    fuzzy = $('#fuzzy');
    results = $('#results');
    query = $('#query');
    output = $('#output');
    head = $('#head');
    body = $('#body');
    title = $('#title');
    tags = $('#tags');
    newdoc = $('#newdoc');

    // global states
    file = null;
    active = false;

    connect();
    query.focus();

    query.keypress(function(event) {
        if (event.keyCode == 13) {
            var text = query.val();
            send_command('query', text);
            event.preventDefault();
        }
    });

    newdoc.click(function(event) {
        file = null;
        var term = query.val();
        render_output({
            'title': term,
            'tags': [],
            'body': ''
        });
        select_all(title[0]);
    });

    output.keypress(function(event) {
        if (((event.keyCode == 10) || (event.keyCode == 13)) && event.shiftKey) { // shift + return
            if (is_modified()) {
                save_output();
            }
            event.preventDefault();
        } else if (((event.keyCode == 10) || (event.keyCode == 13)) && event.metaKey) { // control + return
            if (active) {
                create_tag();
            }
        } else if (event.keyCode == 27) {
            if (is_modified()) {
                revert();
            }
        }
    });

    title.keydown(function(event) {
        if (event.keyCode == 13) {
            if (!event.shiftKey && !event.metaKey) {
                event.preventDefault();
            }
        } else if ((event.keyCode == 40) || ((event.keyCode == 39) && is_caret_at_end(title[0]))) {
            set_caret_at_beg(body[0]);
            event.preventDefault();
        }
    });

    body.keydown(function(event) {
        if ((event.keyCode == 37) && is_caret_at_beg(body[0])) {
            set_caret_at_end(title[0]);
            output[0].scrollTop = 0;
            event.preventDefault();
        } else if ((event.keyCode == 38) && is_caret_at_beg(body[0])) {
            set_caret_at_beg(title[0]);
            output[0].scrollTop = 0;
            event.preventDefault();
        }
    });

    output.bind('input', function() {
        set_modified(true);
    });

    $(document).unbind('keydown').bind('keydown', function(event) {
        if (event.keyCode == 8) {
            if (!is_editable(event.target)) {
                console.log('rejecting editing key: ', event.target.tagName.toLowerCase());
                event.preventDefault();
            }
        } else if (event.keyCode == 9) {
            if (event.target.getAttribute('contentEditable')) {
                query.focus();
                event.preventDefault();
            }
        }
        if ((event.keyCode == 38) || (event.keyCode == 40)) {
            if (!event.target.getAttribute('contentEditable')) {
                var box = $('.res_box.selected');
                var other;
                if (event.keyCode == 40) { // down
                    if (box.length == 0) {
                        other = $('.res_box:first-child');
                    } else {
                        other = box.next();
                    }
                } else { // up
                    if (box.length == 0) {
                        return;
                    } else {
                        other = box.prev();
                    }
                }
                if (other.length > 0) {
                    select_entry(other);
                }
                event.preventDefault();
            }
        }
    });
});

