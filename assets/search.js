/* WidgetCore Documentation — جستجوی کلاینت‌ساید
   ایندکس JSON همان زبان، نرمال‌سازی فارسی/عربی، بدون هیچ درخواست خارجی. */
(function () {
	'use strict';

	var doc = document;
	var root = doc.documentElement;
	var modal = doc.querySelector('[data-search-modal]');
	if (!modal) { return; }

	var input = modal.querySelector('[data-search-input]');
	var results = modal.querySelector('[data-search-results]');
	var empty = modal.querySelector('[data-search-empty]');
	var loading = modal.querySelector('[data-search-loading]');
	var countEl = modal.querySelector('[data-search-count]');
	var box = modal.querySelector('[role="dialog"]') || modal;
	var pagePath = modal.getAttribute('data-search-page') || '';
	var indexSrc = modal.getAttribute('data-search-index') || '';
	var lang = modal.getAttribute('data-search-lang') || root.lang || 'en';
	var isFa = lang === 'fa';

	var index = null;
	var normIndex = null;
	var loadingPromise = null;
	var activeItem = -1;
	var lastTrigger = null;
	var timer = null;
	var MAX = 12;

	var strings = { results: 'results' };
	var island = doc.querySelector('[data-ui-strings]');
	if (island) {
		try {
			var parsed = JSON.parse(island.textContent || '{}');
			Object.keys(parsed).forEach(function (k) { strings[k] = parsed[k]; });
		} catch (e) { /* پیش‌فرض می‌ماند */ }
	}

	function faDigits(s) {
		return String(s);
	}
	function digits(s) { return isFa ? faDigits(s) : String(s); }

	/* نرمال‌سازی: حروف کوچک، ی/ک عربی→فارسی، ارقام عربی/فارسی→لاتین، حذف اعراب،
	   کشیده و نیم‌فاصله؛ دیگر نشانه‌های نامرئی و جهت‌نما → فاصله. */
	function foldChar(ch) {
		var c = ch.toLowerCase();
		if (/[\u064b-\u0652\u0670\u0640]/.test(c)) { return null; }
		if (c === '\u200c' || c === '\u200d') { return null; }
		if (/[\u200b\u200e\u200f\u202a-\u202e\ufeff]/.test(c)) { c = ' '; }
		if (c === '\u0622' || c === '\u0623' || c === '\u0625') { c = '\u0627'; }
		if (c === '\u064a' || c === '\u0649') { c = '\u06cc'; }
		if (c === '\u0643') { c = '\u06a9'; }
		var d = c.charCodeAt(0);
		if (d >= 0x0660 && d <= 0x0669) { c = String(d - 0x0660); }
		else if (d >= 0x06f0 && d <= 0x06f9) { c = String(d - 0x06f0); }
		return c;
	}

	function norm(value) {
		var src = String(value === null || value === undefined ? '' : value);
		var out = '';
		for (var i = 0; i < src.length; i++) {
			var c = foldChar(src[i]);
			if (c === null) { continue; }
			out += c;
		}
		return out.replace(/\s+/g, ' ').trim();
	}

	/* نسخه‌ی تاشده‌ی متن همراه نگاشت به اندیس متن اصلی (برای برش درست گزیده) */
	function foldMap(value) {
		var src = String(value === null || value === undefined ? '' : value);
		var text = '';
		var map = [];
		var space = false;
		for (var i = 0; i < src.length; i++) {
			var c = foldChar(src[i]);
			if (c === null) { continue; }
			if (/\s/.test(c)) {
				if (!space && text.length) { text += ' '; map.push(i); }
				space = true;
				continue;
			}
			space = false;
			text += c;
			map.push(i);
		}
		return { text: text.replace(/ $/, ''), map: map };
	}

	function escapeHtml(s) {
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	/* مسیر نسبی از صفحه‌ی جاری به مقصد (همان الگوریتم مولد) */
	function rel(from, to) {
		var a = String(from).split('/').filter(Boolean);
		var b = String(to).split('/').filter(Boolean);
		var i = 0;
		while (i < a.length && i < b.length && a[i] === b[i]) { i++; }
		var up = a.length - i;
		var prefix = '';
		for (var n = 0; n < up; n++) { prefix += '../'; }
		var rest = b.slice(i).join('/');
		return prefix + rest + (rest && /\/$/.test(to) ? '/' : '') || './';
	}

	function loadIndex() {
		if (index) { return Promise.resolve(index); }
		if (loadingPromise) { return loadingPromise; }
		loadingPromise = new Promise(function (resolve, reject) {
			function done(data) {
				try {
					index = (data && data.items) || [];
					normIndex = index.map(function (item) {
						var folded = foldMap(item.b);
						return { t: norm(item.t), d: norm(item.d), g: norm(item.g), h: (item.h || []).map(norm), b: folded.text, map: folded.map, rawBody: String(item.b || '') };
					});
					resolve(index);
				} catch (e) { reject(e); }
			}
			if (window.fetch) {
				window.fetch(indexSrc, { credentials: 'same-origin' }).then(function (res) {
					if (!res.ok) { throw new Error('index ' + res.status); }
					return res.json();
				}).then(done, reject);
			} else if (window.XMLHttpRequest) {
				var xhr = new window.XMLHttpRequest();
				xhr.open('GET', indexSrc, true);
				xhr.onreadystatechange = function () {
					if (xhr.readyState === 4) {
						if (xhr.status === 200 || xhr.status === 0) {
							try { done(JSON.parse(xhr.responseText)); } catch (e) { reject(e); }
						} else { reject(new Error('index ' + xhr.status)); }
					}
				};
				xhr.send(null);
			} else { reject(new Error('no transport')); }
		});
		loadingPromise.then(null, function () { index = []; normIndex = []; });
		return loadingPromise;
	}

	function scoreItem(entry, words, phrase) {
		var score = 0;
		var hits = 0;
		if (phrase && entry.t.indexOf(phrase) >= 0) { score += 24; }
		for (var i = 0; i < words.length; i++) {
			var w = words[i];
			var found = false;
			if (entry.t.indexOf(w) === 0) { score += 14; found = true; }
			else if (entry.t.indexOf(w) > 0) { score += 9; found = true; }
			for (var h = 0; h < entry.h.length; h++) {
				if (entry.h[h].indexOf(w) >= 0) { score += 6; found = true; break; }
			}
			if (entry.d.indexOf(w) >= 0) { score += 4; found = true; }
			if (entry.g.indexOf(w) >= 0) { score += 2; }
			if (entry.b.indexOf(w) >= 0) { score += 1; found = true; }
			if (found) { hits++; }
		}
		if (hits < words.length) { score = 0; }
		return score;
	}

	function snippet(entry, words) {
		var folded = entry.b;
		var original = String(entry.rawBody === undefined ? folded : entry.rawBody);
		var at = -1;
		for (var i = 0; i < words.length && at < 0; i++) { at = folded.indexOf(words[i]); }
		if (at < 0) { at = 0; }
		var from = Math.max(0, at - 46);
		var to = Math.min(folded.length, at + 96);
		var startIdx = entry.map && entry.map[from] !== undefined ? entry.map[from] : from;
		var endIdx = entry.map && entry.map[to - 1] !== undefined ? entry.map[to - 1] + 1 : to;
		var out = (startIdx > 0 ? '…' : '') + original.slice(startIdx, endIdx).replace(/\s+/g, ' ') + (endIdx < original.length ? '…' : '');
		var safe = escapeHtml(out);
		words.forEach(function (w) {
			if (!w || w.length < 2) { return; }
			var re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
			safe = safe.replace(re, '<mark>$1</mark>');
		});
		return safe;
	}

	function render(list, words) {
		if (!results) { return; }
		results.innerHTML = '';
		activeItem = -1;
		if (countEl) { countEl.textContent = list.length ? digits(list.length) + ' ' + strings.results : ''; }
		if (empty) { empty.hidden = list.length > 0; }
		if (!list.length) { if (input) { input.removeAttribute('aria-activedescendant'); } return; }
		list.forEach(function (hit, i) {
			var item = hit.item;
			var a = doc.createElement('a');
			a.className = 'sr-item';
			a.id = 'sr-' + i;
			a.setAttribute('role', 'option');
			a.setAttribute('aria-selected', 'false');
			a.href = rel(pagePath, item.u);
			var group = item.g ? '<span class="sr-group">' + escapeHtml(item.g) + '</span>' : '';
			var desc = item.d ? '<span class="sr-desc">' + escapeHtml(item.d) + '</span>' : '';
			var snip = hit.entry.b ? '<span class="sr-snippet">' + snippet(hit.entry, words) + '</span>' : '';
			a.innerHTML = group + '<span class="sr-title">' + escapeHtml(item.t) + '</span>' + desc + snip;
			a.addEventListener('mouseenter', function () { setActive(i); });
			results.appendChild(a);
		});
		setActive(0);
	}

	function items() { return results ? results.querySelectorAll('.sr-item') : []; }

	function setActive(i) {
		var list = items();
		if (!list.length) { return; }
		if (i < 0) { i = list.length - 1; }
		if (i >= list.length) { i = 0; }
		for (var n = 0; n < list.length; n++) {
			list[n].classList.toggle('is-active', n === i);
			list[n].setAttribute('aria-selected', String(n === i));
		}
		activeItem = i;
		if (input) { input.setAttribute('aria-activedescendant', list[i].id); }
		if (list[i].scrollIntoView) {
			try { list[i].scrollIntoView({ block: 'nearest' }); } catch (e) { list[i].scrollIntoView(); }
		}
	}

	function search(query) {
		var q = norm(query);
		if (!q || !normIndex) { render([], []); if (empty) { empty.hidden = true; } return; }
		var words = q.split(' ').filter(function (w) { return w.length > 0; });
		var scored = normIndex.map(function (entry, i) {
			return { item: index[i], entry: entry, score: scoreItem(entry, words, q) };
		}).filter(function (h) { return h.score > 0; });
		scored.sort(function (a, b) {
			if (b.score !== a.score) { return b.score - a.score; }
			return String(a.item.u).localeCompare(String(b.item.u));
		});
		render(scored.slice(0, MAX), words);
	}

	function onQuery() {
		if (timer) { window.clearTimeout(timer); }
		timer = window.setTimeout(function () { search(input ? input.value : ''); }, 120);
	}

	function open(trigger) {
		lastTrigger = trigger || lastTrigger || null;
		modal.hidden = false;
		doc.body.classList.add('search-open');
		if (loading) { loading.hidden = false; }
		loadIndex().then(function () {
			if (loading) { loading.hidden = true; }
			if (input && input.value) { search(input.value); }
		}, function () {
			if (loading) { loading.hidden = true; }
			index = [];
			normIndex = [];
			render([], []);
		});
		if (input) { input.focus(); input.select(); }
	}

	function close() {
		modal.hidden = true;
		doc.body.classList.remove('search-open');
		if (lastTrigger && lastTrigger.focus) { lastTrigger.focus(); }
	}

	doc.querySelectorAll('[data-search-open]').forEach(function (btn) {
		btn.addEventListener('click', function () { open(btn); });
	});
	modal.querySelectorAll('[data-search-close]').forEach(function (el) {
		el.addEventListener('click', close);
	});
	if (input) {
		input.addEventListener('input', onQuery);
		input.addEventListener('keydown', function (ev) {
			if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive(activeItem + 1); }
			else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive(activeItem - 1); }
			else if (ev.key === 'Enter') {
				var list = items();
				if (list.length) {
					ev.preventDefault();
					var at = activeItem >= 0 ? activeItem : 0;
					window.location.href = list[at].getAttribute('href');
				}
			}
		});
	}
	modal.addEventListener('keydown', function (ev) {
		if (ev.key !== 'Tab') { return; }
		var focusables = modal.querySelectorAll('input, button, a[href]');
		if (!focusables.length) { return; }
		var first = focusables[0];
		var last = focusables[focusables.length - 1];
		if (ev.shiftKey && doc.activeElement === first) { ev.preventDefault(); last.focus(); }
		else if (!ev.shiftKey && doc.activeElement === last) { ev.preventDefault(); first.focus(); }
	});
	doc.addEventListener('keydown', function (ev) {
		if (ev.key === 'Escape' && !modal.hidden) { ev.preventDefault(); close(); return; }
		var combo = (ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K');
		if (combo) {
			ev.preventDefault();
			if (modal.hidden) { open(null); } else { close(); }
			return;
		}
		if (ev.key === '/' && modal.hidden) {
			var tag = doc.activeElement ? doc.activeElement.tagName : '';
			var typing = tag === 'INPUT' || tag === 'TEXTAREA' || (doc.activeElement && doc.activeElement.isContentEditable);
			if (!typing) { ev.preventDefault(); open(null); }
		}
	});

	/* پیش‌بارگیری ایندکس وقتی کاربر بی‌کار است (بدون مسدود کردن رندر) */
	function warm() { loadIndex(); }
	if (window.requestIdleCallback) { window.requestIdleCallback(warm, { timeout: 3000 }); }
	else { window.setTimeout(warm, 2200); }
})();
