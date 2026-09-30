// A small markdown renderer — just what the vault pages use: headings, rules,
// tables, nested lists, quotes and Obsidian callouts, bold/italic/code/links.

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const isList = l => /^\s*([-*+]|\d+\.)\s+/.test(l);
  const isTable = l => /^\s*\|.*\|\s*$/.test(l);
  const blank = l => !l.trim();

  while (i < lines.length) {
    const l = lines[i];
    if (blank(l)) { i++; continue; }

    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
      const n = Math.min(6, m[1].length + 1);
      out.push(`<h${n}>${inline(m[2].replace(/\s*#+\s*$/, ''))}</h${n}>`);
      i++; continue;
    }
    if (/^\s*([-_*])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }

    if (isTable(l)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) rows.push(lines[i++]);
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const sepIdx = rows.findIndex(r => /^\s*\|?\s*:?-{2,}/.test(r));
      const head = sepIdx === 1 ? cells(rows[0]) : null;
      const align = sepIdx === 1 ? cells(rows[1]).map(c => /^:.*:$/.test(c) ? 'center' : /:$/.test(c) ? 'right' : '') : [];
      const body = rows.slice(sepIdx === 1 ? 2 : 0).map(cells);
      const td = (t, c, k) => `<${t}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</${t}>`;
      out.push('<div class="tbl"><table>' +
        (head ? '<thead><tr>' + head.map((c, k) => td('th', c, k)).join('') + '</tr></thead>' : '') +
        '<tbody>' + body.map(r => '<tr>' + r.map((c, k) => td('td', c, k)).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }

    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      let cls = 'quote', title = '';
      const c = buf[0].match(/^\[!(\w+)\][-+]?\s*(.*)$/);
      if (c) { cls += ' callout ' + c[1].toLowerCase(); title = c[2]; buf.shift(); }
      // "> Heading.\n> text" style asides
      out.push(`<blockquote class="${cls}">${title ? `<div class="ct">${inline(title)}</div>` : ''}${md(buf.join('\n'))}</blockquote>`);
      continue;
    }

    if (isList(l)) {
      const items = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (isList(cur)) {
          const ind = cur.match(/^(\s*)/)[1].replace(/\t/g, '  ').length;
          items.push({ ind, ord: /^\s*\d+\./.test(cur), text: cur.replace(/^\s*([-*+]|\d+\.)\s+/, '') });
          i++;
        } else if (blank(cur)) {
          let j = i; while (j < lines.length && blank(lines[j])) j++;
          if (j < lines.length && isList(lines[j])) { i = j; continue; }
          // an indented continuation after a blank line belongs to the last item
          if (j < lines.length && /^\s{2,}|\t/.test(lines[j]) && items.length) { i = j; continue; }
          break;
        } else if (/^(\s{2,}|\t)/.test(cur) && items.length) {
          items[items.length - 1].text += ' ' + cur.trim(); i++;
        } else break;
      }
      out.push(renderList(items));
      continue;
    }

    const para = [];
    while (i < lines.length && !blank(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !isTable(lines[i]) &&
      !/^\s*>/.test(lines[i]) && !isList(lines[i]) && !/^\s*([-_*])(\s*\1){2,}\s*$/.test(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

function renderList(items) {
  let html = '', stack = [];
  for (const it of items) {
    while (stack.length && it.ind < stack[stack.length - 1].ind) html += `</li></${stack.pop().tag}>`;
    const top = stack[stack.length - 1];
    if (!top || it.ind > top.ind) {
      const tag = it.ord ? 'ol' : 'ul';
      stack.push({ ind: it.ind, tag });
      html += `<${tag}><li>`;
    } else html += '</li><li>';
    html += inline(it.text);
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}
