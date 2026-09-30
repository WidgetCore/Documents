/* WidgetCore Documentation — runtime behaviour
   پوسته، ناوبری، زبانه‌ها، کپی کد، فهرست «در این صفحه». بدون وابستگی خارجی. */
(function () {
	'use strict';

	var doc = document;
	var root = doc.documentElement;
	var THEME_KEY = 'wgcr-theme';

	function q(sel, ctx) { return (ctx || doc).querySelector(sel); }
	function qa(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
	function svgIcon(name) {
		return '<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
	}

	var strings = { copy: 'Copy code', copied: 'Copied', results: 'results', lang: 'en' };
	var island = q('[data-ui-strings]');
	if (island) {
		try {
			var parsed = JSON.parse(island.textContent || '{}');
			Object.keys(parsed).forEach(function (k) { strings[k] = parsed[k]; });
		} catch (e) { /* جزیره‌ی رشته‌ها خوانده نشد؛ مقدارهای پیش‌فرض می‌ماند */ }
	}

	function storage(kind) {
		try {
			var s = window[kind];
			s.setItem('wgcr-probe', '1');
			s.removeItem('wgcr-probe');
			return s;
		} catch (e) { return null; }
	}
	var ls = storage('localStorage');
	var ss = storage('sessionStorage');
	function read(st, key, fallback) {
		try { var v = st ? st.getItem(key) : null; return v === null ? fallback : v; } catch (e) { return fallback; }
	}
	function write(st, key, value) {
		try { if (st) { st.setItem(key, value); } } catch (e) { /* ذخیره‌سازی در دسترس نیست */ }
	}

	/* ---------------- پوسته ---------------- */

	function systemDark() {
		return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
	}
	function resolved(mode) {
		if (mode === 'light' || mode === 'dark') { return mode; }
		return systemDark() ? 'dark' : 'light';
	}
	function applyTheme(mode, persist) {
		var eff = resolved(mode);
		root.classList.toggle('dark', eff === 'dark');
		root.classList.toggle('light', eff === 'light');
		root.setAttribute('data-theme', eff);
		root.setAttribute('data-theme-mode', mode);
		root.style.colorScheme = eff;
		qa('[data-theme-set]').forEach(function (btn) {
			btn.setAttribute('aria-checked', String(btn.getAttribute('data-theme-set') === mode));
		});
		if (persist) { write(ls, THEME_KEY, mode); }
	}

	var mode = read(ls, THEME_KEY, 'system');
	applyTheme(mode, false);
	if (window.matchMedia) {
		try {
			var mq = window.matchMedia('(prefers-color-scheme: dark)');
			var onSystem = function () { if (read(ls, THEME_KEY, 'system') === 'system') { applyTheme('system', false); } };
			if (mq.addEventListener) { mq.addEventListener('change', onSystem); } else if (mq.addListener) { mq.addListener(onSystem); }
		} catch (e) { mq = null; }
	}
	function setThemeMenu(menu, trigger, open, restoreFocus) {
		menu.hidden = !open;
		trigger.setAttribute('aria-expanded', String(open));
		if (open) {
			var selected = q('[data-theme-set][aria-checked="true"]', menu) || q('[data-theme-set]', menu);
			if (selected && selected.focus) { selected.focus(); }
		} else if (restoreFocus && trigger.focus) { trigger.focus(); }
	}

	qa('[data-theme-menu-toggle]').forEach(function (trigger) {
		var menu = trigger.parentNode.querySelector('[data-theme-menu]');
		if (!menu) { return; }
		trigger.addEventListener('click', function () {
			setThemeMenu(menu, trigger, menu.hidden, false);
		});
		qa('[data-theme-set]', menu).forEach(function (option) {
			option.addEventListener('click', function () {
				applyTheme(option.getAttribute('data-theme-set'), true);
				setThemeMenu(menu, trigger, false, true);
			});
		});
		menu.addEventListener('keydown', function (ev) {
			var options = qa('[data-theme-set]', menu);
			var index = options.indexOf(doc.activeElement);
			if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
				ev.preventDefault();
				var delta = ev.key === 'ArrowDown' ? 1 : -1;
				options[(index + delta + options.length) % options.length].focus();
			} else if (ev.key === 'Home' || ev.key === 'End') {
				ev.preventDefault();
				options[ev.key === 'Home' ? 0 : options.length - 1].focus();
			}
		});
		doc.addEventListener('click', function (ev) {
			if (!trigger.parentNode.contains(ev.target) && !menu.hidden) { setThemeMenu(menu, trigger, false, false); }
		});
		doc.addEventListener('keydown', function (ev) {
			if (ev.key === 'Escape' && !menu.hidden) {
				setThemeMenu(menu, trigger, false, true);
			}
		});
	});

	/* ---------------- گروه‌های نوار کناری ---------------- */

	var groups = qa('[data-nav-group]');
	var anyCurrent = !!q('.nav-link.is-current');

	function setGroup(group, open) {
		var head = q('[data-nav-head]', group);
		group.classList.toggle('is-open', open);
		if (head) { head.setAttribute('aria-expanded', String(open)); }
	}
	groups.forEach(function (group, i) {
		var head = q('[data-nav-head]', group);
		var hasCurrent = !!q('.nav-link.is-current', group);
		var open = anyCurrent ? hasCurrent : i === 0;
		setGroup(group, open);
		if (head) {
			head.addEventListener('click', function () {
				var open = !group.classList.contains('is-open');
				groups.forEach(function (item) { setGroup(item, item === group && open); });
			});
		}
	});
	var currentLink = q('.nav-link.is-current');
	if (currentLink && currentLink.scrollIntoView) {
		try { currentLink.scrollIntoView({ block: 'nearest' }); } catch (e) { currentLink.scrollIntoView(); }
	}

	/* ---------------- کشوی نوار در صفحه‌های کوچک ---------------- */

	var navToggle = q('[data-nav-toggle]');
	var sidebar = q('[data-sidebar]');
	var scrim = q('[data-scrim]');

	function isDesktopMenu() {
		return !!(window.matchMedia && window.matchMedia('(min-width: 981px)').matches);
	}
	function menuIsOpen() {
		return doc.body.classList.contains('nav-open') || doc.body.classList.contains('quick-menu-open');
	}
	function setDrawer(open, restoreFocus) {
		var desktop = isDesktopMenu();
		doc.body.classList.remove('nav-open', 'quick-menu-open');
		if (open) { doc.body.classList.add(desktop ? 'quick-menu-open' : 'nav-open'); }
		if (navToggle) { navToggle.setAttribute('aria-expanded', String(open)); }
		if (scrim) { scrim.hidden = !open; }
		if (sidebar) {
			if (open && desktop) {
				sidebar.setAttribute('role', 'dialog');
				sidebar.setAttribute('aria-modal', 'true');
				sidebar.setAttribute('aria-labelledby', 'sidebar-quick-title');
				sidebar.setAttribute('tabindex', '-1');
			} else {
				sidebar.removeAttribute('role');
				sidebar.removeAttribute('aria-modal');
				sidebar.removeAttribute('aria-labelledby');
				sidebar.removeAttribute('tabindex');
			}
			if (open) {
				var target = desktop ? q('.sidebar-search', sidebar) : (q('.nav-link.is-current', sidebar) || sidebar);
				if (target && target.focus) { target.focus(); }
			}
		}
		if (!open && restoreFocus && navToggle && navToggle.focus) { navToggle.focus(); }
	}
	if (navToggle) {
		navToggle.addEventListener('click', function () { setDrawer(!menuIsOpen()); });
	}
	qa('[data-sidebar-close]').forEach(function (btn) {
		btn.addEventListener('click', function () { setDrawer(false, true); });
	});
	if (scrim) { scrim.addEventListener('click', function () { setDrawer(false, true); }); }
	if (sidebar) {
		sidebar.addEventListener('keydown', function (ev) {
			if (ev.key !== 'Tab' || !doc.body.classList.contains('quick-menu-open')) { return; }
			var focusables = qa('button:not([disabled]), a[href]', sidebar);
			if (!focusables.length) { return; }
			var first = focusables[0];
			var last = focusables[focusables.length - 1];
			if (ev.shiftKey && doc.activeElement === first) { ev.preventDefault(); last.focus(); }
			else if (!ev.shiftKey && doc.activeElement === last) { ev.preventDefault(); first.focus(); }
		});
		sidebar.querySelectorAll('a[href]').forEach(function (link) {
			link.addEventListener('click', function () { if (menuIsOpen()) { setDrawer(false, false); } });
		});
	}
	doc.addEventListener('keydown', function (ev) {
		if (ev.key === 'Escape' && menuIsOpen()) {
			var searchModal = q('[data-search-modal]');
			if (searchModal && !searchModal.hidden) { return; }
			ev.preventDefault();
			setDrawer(false, true);
		}
	});
	window.addEventListener('resize', function () {
		if ((doc.body.classList.contains('quick-menu-open') && !isDesktopMenu()) || (doc.body.classList.contains('nav-open') && isDesktopMenu())) {
			setDrawer(false, false);
		}
	});

	/* ---------------- فهرست «در این صفحه» ---------------- */

	var tocLinks = qa('.toc-list a');
	if (tocLinks.length) {
		var heads = [];
		var headsById = {};
		tocLinks.forEach(function (a) {
			var id = (a.getAttribute('href') || '').replace(/^#/, '');
			var el = id ? doc.getElementById(id) : null;
			if (el) {
				if (!headsById[id]) { headsById[id] = { el: el, links: [] }; heads.push(headsById[id]); }
				headsById[id].links.push(a);
			}
		});
		var activeHead = null;
		var ticking = false;
		var spy = function () {
			ticking = false;
			var offset = 96;
			var current = null;
			for (var i = 0; i < heads.length; i++) {
				var top = heads[i].el.getBoundingClientRect().top;
				if (top <= offset) { current = heads[i]; } else { break; }
			}
			if (!current && heads.length) { current = heads[0]; }
			if (current && current !== activeHead) {
				if (activeHead) { activeHead.links.forEach(function (a) { a.classList.remove('is-active'); a.removeAttribute('aria-current'); }); }
				current.links.forEach(function (a) { a.classList.add('is-active'); a.setAttribute('aria-current', 'true'); });
				activeHead = current;
			}
		};
		window.addEventListener('scroll', function () {
			if (!ticking) { ticking = true; window.requestAnimationFrame ? window.requestAnimationFrame(spy) : spy(); }
		}, { passive: true });
		spy();
	}

	/* ---------------- دکمه‌ی کپی کد ---------------- */

	function copyText(text) {
		if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
			return window.navigator.clipboard.writeText(text);
		}
		return new Promise(function (resolve, reject) {
			try {
				var ta = doc.createElement('textarea');
				ta.value = text;
				ta.setAttribute('readonly', 'readonly');
				ta.style.position = 'absolute';
				ta.style.insetInlineStart = '-9999px';
				doc.body.appendChild(ta);
				ta.select();
				var ok = doc.execCommand ? doc.execCommand('copy') : false;
				doc.body.removeChild(ta);
				if (ok) { resolve(); } else { reject(new Error('copy failed')); }
			} catch (e) { reject(e); }
		});
	}

	qa('figure.code').forEach(function (fig) {
		var bar = q('.code-bar', fig);
		var code = q('pre', fig);
		if (!bar || !code || q('.code-copy', bar)) { return; }
		var btn = doc.createElement('button');
		btn.type = 'button';
		btn.className = 'code-copy';
		btn.setAttribute('aria-label', strings.copy);
		btn.innerHTML = svgIcon('copy') + '<span>' + strings.copy + '</span>';
		bar.appendChild(btn);
		btn.addEventListener('click', function () {
			copyText(code.textContent || '').then(function () {
				btn.classList.add('is-done');
				btn.innerHTML = svgIcon('check') + '<span>' + strings.copied + '</span>';
				window.setTimeout(function () {
					btn.classList.remove('is-done');
					btn.innerHTML = svgIcon('copy') + '<span>' + strings.copy + '</span>';
				}, 1800);
			}, function () { btn.setAttribute('aria-label', strings.copy); });
		});
	});

	/* ---------------- زبانه‌ها ---------------- */

	qa('[data-tabs]').forEach(function (tabs) {
		var btns = qa('.tab-btn', tabs);
		var panels = qa('.tab-panel', tabs);
		if (!btns.length) { return; }
		var key = 'wgcr-tab-' + (tabs.id || '');

		function select(index, focus) {
			btns.forEach(function (b, i) {
				var on = i === index;
				b.setAttribute('aria-selected', String(on));
				b.tabIndex = on ? 0 : -1;
				if (panels[i]) { panels[i].hidden = !on; }
				if (on && focus && b.focus) { b.focus(); }
			});
			write(ss, key, String(index));
		}
		btns.forEach(function (b, i) {
			b.addEventListener('click', function () { select(i, false); });
		});
		tabs.addEventListener('keydown', function (ev) {
			var at = btns.indexOf(doc.activeElement);
			if (at < 0) { return; }
			var next = -1;
			if (ev.key === 'ArrowRight') { next = (at + 1) % btns.length; }
			else if (ev.key === 'ArrowLeft') { next = (at - 1 + btns.length) % btns.length; }
			else if (ev.key === 'Home') { next = 0; }
			else if (ev.key === 'End') { next = btns.length - 1; }
			if (next >= 0) { ev.preventDefault(); select(next, true); }
		});
		var saved = read(ss, key, null);
		if (saved !== null && btns[Number(saved)]) { select(Number(saved), false); }
	});

	/* ---------------- پیشرفت پیمایش صفحه، مستقل از اسکرول منو ---------------- */

	var progress = q('[data-reading-progress]');
	if (progress) {
		var progressFrame = null;
		function updateProgress() {
			progressFrame = null;
			var scroller = doc.scrollingElement || root;
			var distance = scroller.scrollHeight - scroller.clientHeight;
			var ratio = distance > 0 ? Math.max(0, Math.min(1, scroller.scrollTop / distance)) : 0;
			progress.style.transform = 'scaleX(' + ratio + ')';
		}
		function scheduleProgress() {
			if (progressFrame === null) { progressFrame = window.requestAnimationFrame(updateProgress); }
		}
		window.addEventListener('scroll', scheduleProgress, { passive: true });
		window.addEventListener('resize', scheduleProgress);
		window.addEventListener('pageshow', scheduleProgress);
		if (window.ResizeObserver) {
			var progressObserver = new window.ResizeObserver(scheduleProgress);
			progressObserver.observe(doc.body);
		}
		updateProgress();
	}

	/* ---------------- تغییرات‌نامه: فقط یک نسخه باز ---------------- */

	var releases = qa('[data-release]');
	if (releases.length) {
		var printing = false;
		var wasOpen = [];
		var openRelease = function (item) {
			releases.forEach(function (other) { other.open = other === item; });
		};
		var fromHash = function () {
			var id = location.hash.length > 1 ? decodeURIComponent(location.hash.slice(1)) : '';
			var target = id ? doc.getElementById(id) : null;
			var item = target ? target.closest('[data-release]') : null;
			if (item) {
				openRelease(item);
				target.scrollIntoView();
			}
		};
		releases.forEach(function (item) {
			item.addEventListener('toggle', function () { if (item.open && !printing) { openRelease(item); } });
		});
		qa('.release-summary .hlink').forEach(function (link) {
			link.addEventListener('click', function (ev) {
				ev.preventDefault();
				location.hash = link.getAttribute('href');
			});
		});
		window.addEventListener('hashchange', fromHash);
		window.addEventListener('beforeprint', function () {
			printing = true;
			wasOpen = releases.map(function (item) { return item.open; });
			releases.forEach(function (item) { item.open = true; });
		});
		window.addEventListener('afterprint', function () {
			releases.forEach(function (item, n) { item.open = wasOpen[n]; });
			window.setTimeout(function () { printing = false; }, 0);
		});
		fromHash();
	}

	/* ---------------- چاپ ---------------- */

	var printBtn = q('[data-print]');
	if (printBtn) {
		printBtn.addEventListener('click', function () {
			try { window.print(); } catch (e) { printBtn.hidden = true; }
		});
	}
})();
