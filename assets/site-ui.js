/* شمارنده‌ی دانلود و فهرست موبایلِ breadcrumb */
(function () {
	'use strict';
	var doc = document;
	var window = doc.defaultView;
	var q = function (selector, root) { return (root || doc).querySelector(selector); };
	var qa = function (selector, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(selector)); };
	var storage;
	try { storage = window.localStorage; } catch (e) { storage = null; }
	function read(key, fallback) {
		try { var value = storage && storage.getItem(key); return value === null || value === undefined ? fallback : value; } catch (e) { return fallback; }
	}
	function write(key, value) {
		try { if (storage) { storage.setItem(key, value); } } catch (e) { /* ذخیره‌سازی در دسترس نیست */ }
	}

	/* شمارنده‌ی عددی دانلودهای GitHub؛ مقدار شش ساعت در مرورگر cache می‌شود. */
	var downloadCountNodes = qa('[data-download-count]');
	if (downloadCountNodes.length && window.fetch) {
		var downloadCacheKey = 'wgcr-download-count-v1';
		var downloadApi = downloadCountNodes[0].getAttribute('data-count-api');
		var cachedDownloadCount = null;
		try { cachedDownloadCount = JSON.parse(read(downloadCacheKey, 'null')); } catch (e) { cachedDownloadCount = null; }
		var cacheValid = cachedDownloadCount && Number.isSafeInteger(cachedDownloadCount.count) && cachedDownloadCount.count >= 0 && Date.now() - cachedDownloadCount.updated < 21600000;
		function showDownloadCount(count) {
			downloadCountNodes.forEach(function (node) {
				node.textContent = String(count);
				node.setAttribute('aria-busy', 'false');
			});
		}
		if (cachedDownloadCount && Number.isSafeInteger(cachedDownloadCount.count) && cachedDownloadCount.count >= 0) {
			showDownloadCount(cachedDownloadCount.count);
		}
		if (!cacheValid && downloadApi) {
			window.fetch(downloadApi, { headers: { Accept: 'application/vnd.github+json' } }).then(function (response) {
				if (!response.ok) { throw new Error('GitHub download count unavailable'); }
				return response.json();
			}).then(function (releases) {
				if (!Array.isArray(releases)) { throw new Error('Invalid GitHub releases response'); }
				var total = releases.reduce(function (sum, release) {
					return sum + (Array.isArray(release.assets) ? release.assets.reduce(function (assetSum, asset) {
						return assetSum + (Number.isSafeInteger(asset.download_count) && asset.download_count > 0 ? asset.download_count : 0);
					}, 0) : 0);
				}, 0);
				showDownloadCount(total);
				write(downloadCacheKey, JSON.stringify({ count: total, updated: Date.now() }));
			}).catch(function () {
				if (!cachedDownloadCount) {
					downloadCountNodes.forEach(function (node) { node.setAttribute('aria-busy', 'false'); });
				}
			});
		}
	}

	/* ---------------- فهرست موبایل کنار مسیر راهنما ---------------- */

	var tocToggle = q('[data-toc-toggle]');
	var mobileToc = q('[data-mobile-toc]');
	function setMobileToc(open, restoreFocus) {
		if (!tocToggle || !mobileToc) { return; }
		mobileToc.hidden = !open;
		tocToggle.setAttribute('aria-expanded', String(open));
		if (open) {
			var firstLink = q('a[href^="#"]', mobileToc);
			if (firstLink && firstLink.focus) { firstLink.focus(); }
		} else if (restoreFocus && tocToggle.focus) { tocToggle.focus(); }
	}
	if (tocToggle && mobileToc) {
		tocToggle.addEventListener('click', function () { setMobileToc(mobileToc.hidden, false); });
		mobileToc.addEventListener('click', function (ev) {
			if (ev.target && ev.target.closest && ev.target.closest('a[href^="#"]')) { setMobileToc(false, false); }
		});
		doc.addEventListener('click', function (ev) {
			if (!mobileToc.hidden && !mobileToc.contains(ev.target) && !tocToggle.contains(ev.target)) { setMobileToc(false, false); }
		});
		doc.addEventListener('keydown', function (ev) {
			if (ev.key === 'Escape' && !mobileToc.hidden) { ev.preventDefault(); setMobileToc(false, true); }
		});
	}

})();
