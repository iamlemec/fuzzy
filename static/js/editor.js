/* fuzzy editor */

// begin module
var editor = (function() {

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

// escaping
function strip_tags(html) {
    return html.replace(/\n/g, '')
               .replace(/<div ?.*?>/g, '')
               .replace(/<br>/g, '')
               .replace(/<span ?.*?>/g, '')
               .replace(/<\/span>/g, '')
               .replace(/<\/div>/g, '\n')
               .replace(/&amp;/g, '&');
};

function standardize_name(name) {
    return name.toLowerCase().trim().replace(/\W/g, '_').replace(/_{2,}/g, '_');
}

// tools
function is_editable(element) {
    var tag = element.tagName.toLowerCase();
    return (element.getAttribute('contentEditable') || (tag == 'input') || (tag == 'textarea'));
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

function intercept_paste(event) {
    // only get text data
    var text = event.originalEvent.clipboardData.getData('text');

    // other method
    document.execCommand('insertText', false, text);

    // stop normal paste
    event.preventDefault();
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
    var num = info['num'];
    var text = info['text'].join('<br/>');
    var name = '<span class="res_name">' + file + ' (' + num + ')</span>';
    var box = $('<div>', {class: 'res_box', file: file, num: num});
    var span = $('<span>', {class: 'res_title', html: name + '<br/>' + text});
    box.append(span);
    box.click(function(event) {
        select_entry(box);
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
    body.text(info['body']).trigger('input');
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
                return false;
            }
        }
    });
    lab.focusout(function() {
        lab.attr('contentEditable', 'false');
    });
}

function save_output(box) {
    var tag = tags.find('.tag_lab').map(function(i, t) { return t.innerHTML; } ).toArray();
    var tit = title[0].innerText;
    var bod = body[0].innerText;
    if (bod.endsWith('\n')) {
        bod = bod.slice(0, -1);
    }
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
        if (event.keyCode == 13) { // return
            var text = query.val();
            if (event.ctrlKey) {
                var name = standardize_name(text);
                send_command('create_or_open', {'file': name, 'title': text});
                body.focus();
            } else {
                send_command('query', text);
            }
            return false;
        }
    });

    newdoc.click(function(event) {
        var text = query.val();
        var title = standardize_name(text);
        send_command('create_or_open', {'file': title, 'title': text});
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
        if (((event.keyCode == 10) || (event.keyCode == 13)) && event.shiftKey) { // shift + return
            if (is_modified()) {
                save_output();
            }
            return false;
        } else if (((event.keyCode == 10) || (event.keyCode == 13)) && event.ctrlKey) { // control + return
            if (active) {
                create_tag();
            }
        }
    });

    title.keydown(function(event) {
        if (event.keyCode == 13) { // return
            if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
                return false;
            }
        } else if ((event.keyCode == 34) || (event.keyCode == 40) || ((event.keyCode == 39) && is_caret_at_end(title[0]))) { // pgdn/down/right
            set_caret_at_beg(body[0]);
            output.scrollTop(0);
            return false;
        }
    });

    body.keydown(function(event) {
        if ((event.keyCode == 37) && is_caret_at_beg(body[0])) { // left
            set_caret_at_end(title[0]);
            output.scrollTop(0);
            return false;
        } else if (((event.keyCode == 33) || (event.keyCode == 38)) && is_caret_at_beg(body[0])) { // pgup/up
            set_caret_at_beg(title[0]);
            output.scrollTop(0);
            return false;
        } else if ((event.keyCode == 40) && is_caret_at_end(body[0])) {
            output.scrollTop(output.prop('scrollHeight'));
            return false;
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
    output.bind('input', function() {
        if (active && editing) {
            set_modified(true);
        }
    });

    $(document).unbind('keydown').bind('keydown', function(event) {
        if (event.keyCode == 8) {
            if (!is_editable(event.target)) {
                console.log('rejecting editing key: ', event.target.tagName.toLowerCase());
                return false;
            }
        }
        if (event.target.id == 'query') {
            if ((!editing || !active) && (event.keyCode == 9)) {
                return false;
            }
            if ((event.keyCode == 38) || (event.keyCode == 40)) {
                var box = $('.res_box.selected');
                var other;
                if (event.keyCode == 40) { // down
                    if (box.length == 0) {
                        other = $('.res_box:first-child');
                    } else {
                        other = box.next();
                    }
                } else if (event.keyCode == 38) { // up
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
            } else if (event.keyCode == 33) { // pgup
                output.stop(true, true);
                output.animate({ scrollTop: output.scrollTop() - 300 }, 200);
                return false;
            } else if (event.keyCode == 34) { // pgdn
                output.stop(true, true);
                output.animate({ scrollTop: output.scrollTop() + 300 }, 200);
                return false;
            }
        } else {
            if (event.keyCode == 9) {
                query.focus();
                return false;
            }
        }
    });

    $(document).unbind('click').bind('click', function(event) {
        if (!(editing && active)) {
            query.focus();
            return false;
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
