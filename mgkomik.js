// ID: ext_mgkomik
// NAME: MG Komik (ID)
// TYPE: comic
// VERSION: 1.0.2
// COLOR: #E50914
// ICON: https://www.google.com/s2/favicons?domain=mgkomik.cc&sz=64
// REFERER: https://web1.mgkomik.cc/

// Domain dicoba berurutan. Jika situs pindah, tambahkan domain baru di daftar ini.
const DOMAINS = [
    'https://web1.mgkomik.cc',
    'https://id.mgkomik.cc',
    'https://web.mgkomik.cc',
];
let BASE = DOMAINS[0];
const UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
];

function pathOf(u) {
    // "/komik/slug/" atau URL penuh -> "/komik/slug/"
    return String(u || '').replace(/^https?:\/\/[^\/]+/i, '') || '/';
}

// Ambil halaman dari domain yang aktif; kalau gagal/tidak valid, coba domain & User-Agent lain.
async function fetchSite(path, marker) {
    path = pathOf(path);
    const order = [BASE].concat(DOMAINS.filter(function (d) { return d !== BASE; }));
    const errs = [];
    for (let i = 0; i < order.length; i++) {
        const d = order[i];
        const host = d.replace('https://', '');
        for (let k = 0; k < UAS.length; k++) {
            try {
                const res = await fetch(d + path, {
                    headers: {
                        'User-Agent': UAS[k],
                        'Referer': d + '/',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                    },
                });
                if (!res.ok) { errs.push(host + ' HTTP ' + res.status); continue; }
                const text = await res.text();
                if (marker && text.indexOf(marker) < 0) {
                    const title = clean((text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [0, ''])[1]);
                    const body = clean(text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')).substring(0, 140);
                    errs.push(host + ' [' + text.length + ' byte] judul="' + title + '" isi="' + body + '"');
                    continue;
                }
                BASE = d;
                return text;
            } catch (e) {
                errs.push(host + ' ' + (e && e.message ? e.message : e));
            }
        }
    }
    throw new Error('MG Komik gagal dimuat: ' + errs.join(' | '));
}

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('http')) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return BASE + (u.startsWith('/') ? '' : '/') + u;
}

function clean(s) {
    if (!s) return '';
    return s
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&#8211;/g, '-')
        .replace(/&#8217;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function firstMatch(re, str, def) {
    const m = str.match(re);
    return m ? m[1] : (def === undefined ? '' : def);
}

var KonmikExtension = {
    // ---------- DAFTAR / PENCARIAN ----------
    async getList(page, query, filters) {
        page = page || 1;
        let url;
        if (query && query.trim()) {
            url = '/search/?q=' + encodeURIComponent(query.trim()) + '&page=' + page;
        } else {
            const order = filters && filters.sort === 'popular' ? 'trending' : 'latest';
            url = '/komik/?filter=&order_by=' + order + '&page=' + page;
        }
        const html = await fetchSite(url, 'bottom-nav');

        // Setiap kartu diawali class="manga-card" (di halaman daftar berupa <div>,
        // di halaman pencarian berupa <a>), jadi pecah HTML berdasarkan itu.
        const chunks = html.split(/(?=<(?:div|a)\b[^>]*class=["']manga-card["'])/i);
        const list = [];
        const seen = {};
        for (let i = 0; i < chunks.length; i++) {
            const c = chunks[i];
            if (!/^<(?:div|a)\b[^>]*class=["']manga-card["']/i.test(c)) continue;
            const slug = firstMatch(/href=["'](?:https?:\/\/[^\/"']+)?\/komik\/([^\/"'?#]+)\/?["']/i, c);
            if (!slug || seen[slug]) continue;
            seen[slug] = true;

            const imgTag = firstMatch(/(<img[^>]*class=["']manga-cover["'][^>]*>)/i, c);
            const src = firstMatch(/(?:data-src|src)=["']([^"']+)["']/i, imgTag);
            const title = clean(firstMatch(/class=["']manga-title["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i, c))
                || clean(firstMatch(/alt=["']([^"']+)["']/i, imgTag))
                || slug.replace(/-/g, ' ');
            const latest = clean(firstMatch(/class=["']chapter-capsule["'][^>]*>([\s\S]*?)<\/(?:a|span)>/i, c));

            list.push({
                id: '/komik/' + slug + '/',
                title: title,
                cover_url: absUrl(src),
                latest_chapter: latest,
                rating: '-',
                views: '-',
            });
        }
        if (list.length === 0 && !(query && query.trim()) && page === 1) {
            throw new Error('MG Komik: halaman terbuka tapi daftar komik tidak ditemukan (' + html.length + ' byte)');
        }
        return { manga_list: list };
    },

    // ---------- DETAIL ----------
    async getDetail(id) {
        const html = await fetchSite(id, 'manga-title');

        const title = clean(firstMatch(/<h1[^>]*class=["']manga-title["'][^>]*>([\s\S]*?)<\/h1>/i, html)) || 'Tanpa Judul';

        const coverBlock = firstMatch(/<div class=["']manga-cover-wrapper["']>([\s\S]*?)<\/div>/i, html);
        let cover = firstMatch(/src=["']([^"']+)["']/i, coverBlock)
            || firstMatch(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i, html);
        cover = absUrl(cover);

        const desc = clean(firstMatch(/id=["']sinopsisContainer["'][^>]*>([\s\S]*?)<\/div>/i, html)) || 'Tidak ada sinopsis.';

        const type = clean(firstMatch(/<div class=["']meta-item["']>([^<]+)<\/div>/i, html));
        const status = clean(firstMatch(/class=["']meta-item status-badge[^"']*["']>([^<]+)</i, html));

        const genres = [];
        const genreBlock = firstMatch(/<div class=["']genre-list["']>([\s\S]*?)<\/div>/i, html);
        const gre = /<a[^>]*class=["']genre-tag["'][^>]*>([\s\S]*?)<\/a>/gi;
        let g;
        while ((g = gre.exec(genreBlock)) !== null) {
            const name = clean(g[1]);
            if (name && genres.indexOf(name) < 0) genres.push(name);
        }
        if (genres.length === 0 && type) genres.push(type);

        // Daftar chapter (urutan situs: terbaru di atas)
        const listHtml = firstMatch(/id=["']chapterList["'][^>]*>([\s\S]*?)<\/ul>/i, html);
        const parts = listHtml.split(/<li class=["']chapter-list-item["']/i);
        const chapters = [];
        for (let i = 1; i < parts.length; i++) {
            const p = parts[i];
            const href = firstMatch(/<a[^>]+href=["']([^"']+)["']/i, p);
            if (!href) continue;
            const num = clean(firstMatch(/class=["']chapter-number["'][^>]*>([\s\S]*?)<\/span>/i, p));
            const date = clean(firstMatch(/class=["']chapter-date["'][^>]*>([\s\S]*?)<\/span>/i, p));
            const full = absUrl(href);
            chapters.push({ id: full, title: num || ('Chapter ' + i), endpoint: full, date: date || '-' });
        }

        return {
            title: title,
            cover_url: cover,
            description: desc,
            author: 'Unknown',
            artist: 'Unknown',
            rating: '-',
            views: '-',
            status: status || 'Ongoing',
            genres: genres,
            chapters: chapters,
        };
    },

    // ---------- GAMBAR CHAPTER ----------
    async getChapterImages(endpoint) {
        const html = await fetchSite(endpoint, 'readingContent');
        const start = html.indexOf('id="readingContent"');
        const area = start >= 0 ? html.substring(start) : html;
        const re = /<img[^>]*?src=["']([^"']+)["'][^>]*?data-page=/gi;
        const images = [];
        let m;
        while ((m = re.exec(area)) !== null) {
            const u = absUrl(m[1].replace(/&amp;/g, '&'));
            if (u.indexOf('/banner/') >= 0) continue;
            if (images.indexOf(u) < 0) images.push(u);
        }
        return images;
    },
};
