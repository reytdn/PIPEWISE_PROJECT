window.Tpl = (function () {
  'use strict';

  const FILE = 'templates.html';
  const files = {};

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Loads the single templates.html file once and splits it into named
  // templates using the "<!-- @template name -->" marker lines.
  function load(names, onDone, onFail) {
    $.ajax({
      url: FILE,
      type: 'GET',
      dataType: 'text',
      cache: true,

      success: function (response) {
        const marker = /^<!-- @template ([\w-]+) -->\r?\n/gm;
        const hits = [];
        let m;
        while ((m = marker.exec(response)) !== null) {
          hits.push({ name: m[1], start: marker.lastIndex, at: m.index });
        }
        hits.forEach((h, i) => {
          const stop = i + 1 < hits.length ? hits[i + 1].at : response.length;
          files[h.name] = response.slice(h.start, stop).replace(/(\r?\n)+$/, '');
        });

        const missing = (names || []).filter((n) => !(n in files));
        if (missing.length) {
          onFail(new Error('Missing template(s) in ' + FILE + ': ' + missing.join(', ')));
          return;
        }
        onDone();
      },

      error: function () {
        onFail(new Error('Could not load ' + FILE));
      }
    });
  }

  function lookup(scope, path) {
    let value = scope;
    const parts = path.split('.');
    for (let i = 0; i < parts.length; i++) {
      if (value === null || value === undefined) return undefined;
      value = value[parts[i]];
    }
    return value;
  }

  const truthy = (value) => (Array.isArray(value) ? value.length > 0 : !!value);

  function parse(source) {
    const pattern = /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*#if\s+([\w.]+)\s*\}\}|\{\{\s*#each\s+([\w.]+)\s*\}\}|\{\{\s*else\s*\}\}|\{\{\s*\/(if|each)\s*\}\}|\{\{\s*([\w.]+)\s*\}\}/g;
    const root = { type: 'root', body: [] };
    const stack = [{ node: root, list: root.body }];
    let last = 0;
    let m;

    const top = () => stack[stack.length - 1];

    while ((m = pattern.exec(source)) !== null) {
      if (m.index > last) top().list.push({ type: 'text', value: source.slice(last, m.index) });
      last = pattern.lastIndex;

      if (m[1]) {
        top().list.push({ type: 'raw', key: m[1] });
      } else if (m[2]) {
        const node = { type: 'if', key: m[2], yes: [], no: [] };
        top().list.push(node);
        stack.push({ node: node, list: node.yes });
      } else if (m[3]) {
        const node = { type: 'each', key: m[3], body: [] };
        top().list.push(node);
        stack.push({ node: node, list: node.body });
      } else if (m[0].replace(/\s/g, '') === '{{else}}') {
        const frame = top();
        if (frame.node.type !== 'if') throw new Error('{{else}} outside of {{#if}}');
        frame.list = frame.node.no;
      } else if (m[4]) {
        if (stack.length === 1 || top().node.type !== m[4]) throw new Error('Unbalanced {{/' + m[4] + '}}');
        stack.pop();
      } else {
        top().list.push({ type: 'value', key: m[5] });
      }
    }

    if (stack.length !== 1) throw new Error('Template block was not closed');
    if (last < source.length) root.body.push({ type: 'text', value: source.slice(last) });
    return root.body;
  }

  function run(nodes, scope) {
    let out = '';
    nodes.forEach((node) => {
      if (node.type === 'text') out += node.value;
      else if (node.type === 'raw') out += lookup(scope, node.key) ?? '';
      else if (node.type === 'value') out += esc(lookup(scope, node.key));
      else if (node.type === 'if') out += run(truthy(lookup(scope, node.key)) ? node.yes : node.no, scope);
      else if (node.type === 'each') {
        const list = lookup(scope, node.key) || [];
        list.forEach((item) => {
          const inner = Object.create(scope);
          Object.assign(inner, item);
          out += run(node.body, inner);
        });
      }
    });
    return out;
  }

  const parsed = {};

  function render(name, data) {
    if (!(name in files)) throw new Error('Template not loaded: ' + name);
    if (!parsed[name]) parsed[name] = parse(files[name]);
    return run(parsed[name], data || {});
  }

  return { load: load, render: render, esc: esc, files: files, parse: parse, run: run };
})();