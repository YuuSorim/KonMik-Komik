// ID: ext_komiklab
// NAME: Komiklab
// TYPE: comic
// VERSION: 1.0.1
// COLOR: #870024
// ICON: https://www.google.com/s2/favicons?domain=komiklab.cc&sz=64
// REFERER: https://komiklab.cc/

const BASE = 'https://komiklab.cc';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': 'https://komiklab.cc/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

async function fetchHtml(url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
}

// Ubah kode HTML seperti &#39; &quot; &amp; menjadi karakter aslinya.
function decodeHtml(s) {
    return (s || '')
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\u0026amp;/g, '\u0026');
}

function stripTags(s) {
    return decodeHtml((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function fixUrl(u) {
    u = decodeHtml(u || '').trim();
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return BASE + u;
    return u;
}

// Ambil URL gambar dari sebuah tag <img ...>
function pickImg(tag) {
    const m = tag.match(/\sdata-src="([^"]+)"/i) ||
              tag.match(/\sdata-lazy-src="([^"]+)"/i) ||
              tag.match(/\ssrc="([^"]+)"/i);
    return m ? fixUrl(m[1]) : '';
}

// Parse kartu komik (.bsx) dari halaman daftar / pencarian
function parseCards(html) {
    const list = [];
    const seen = new Set();
    const re = /<div class="bsx">\s*<a\s([^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const attrs = m[1];
        const inner = m[2];

        const hrefM = attrs.match(/href="([^"]+)"/i);
        if (!hrefM) continue;
        const href = fixUrl(hrefM[1]);
        if (!/\/manga\/[^\/]+\/?$/.test(href) || seen.has(href)) continue;
        seen.add(href);

        let title = '';
        const titleAttr = attrs.match(/title="([^"]*)"/i);
        if (titleAttr && titleAttr[1].trim()) title = decodeHtml(titleAttr[1]).trim();
        if (!title) {
            const tt = inner.match(/<div class="tt">([\s\S]*?)<\/div>/i);
            if (tt) title = stripTags(tt[1]);
        }
        if (!title) title = href.replace(/\/$/, '').split('/').pop().replace(/-/g, ' ');

        const imgTag = inner.match(/<img[^>]*>/i);
        const cover = imgTag ? pickImg(imgTag[0]) : '';

        const ep = inner.match(/<div class="epxs">([\s\S]*?)<\/div>/i);
        const score = inner.match(/<div class="numscore">([\s\S]*?)<\/div>/i);

        list.push({
            id: href,
            title: title,
            cover_url: cover,
            latest_chapter: ep ? stripTags(ep[1]) : '',
            rating: score ? stripTags(score[1]) : '-',
            views: '-'
        });
    }
    return list;
}

// Parser umum: cari tautan ke /manga/<slug>/ yang di dalamnya ada <img> (kartu komik),
// tidak bergantung pada nama class.
function parseCardsGeneric(html) {
    const list = [];
    const seen = new Set();
    const re = /<a\s([^>]*?href="(https?:\/\/komiklab\.cc\/manga\/[^"\/?#]+\/?)"[^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const attrs = m[1];
        const href = m[2];
        const inner = m[3];
        const imgTag = inner.match(/<img[^>]*>/i);
        if (!imgTag || seen.has(href)) continue;
        seen.add(href);
        const img = imgTag[0];

        let title = '';
        const ti = img.match(/\stitle="([^"]*)"/i) ||
                   img.match(/\salt="([^"]*)"/i) ||
                   attrs.match(/\btitle="([^"]*)"/i);
        if (ti && ti[1].trim()) title = decodeHtml(ti[1]).trim();
        if (!title) {
            const tt = inner.match(/<(?:div class="tt"|h\d[^>]*)>([\s\S]*?)<\/(?:div|h\d)>/i);
            if (tt) title = stripTags(tt[1]);
        }
        if (!title) title = href.replace(/\/$/, '').split('/').pop().replace(/-/g, ' ');

        const ep = inner.match(/<div class="epxs">([\s\S]*?)<\/div>/i);
        const score = inner.match(/<div class="numscore">([\s\S]*?)<\/div>/i);

        list.push({
            id: href,
            title: title,
            cover_url: pickImg(img),
            latest_chapter: ep ? stripTags(ep[1]) : '',
            rating: score ? stripTags(score[1]) : '-',
            views: '-'
        });
    }
    return list;
}

// Daftar chapter di halaman detail: tautan "<slug>-chapter-N" milik komik ini saja.
function parseChapters(html, pageUrl) {
    const slugM = pageUrl.replace(/\/$/, '').match(/\/manga\/([^\/?#]+)$/);
    const series = slugM ? slugM[1] : '';

    const collect = (filterBySeries) => {
        const out = [];
        const seen = new Set();
        const re = /<a\s[^>]*href="(https?:\/\/komiklab\.cc\/[^"?#]+-chapter-[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            const link = m[1];
            if (seen.has(link)) continue;
            if (filterBySeries && series && link.indexOf('/' + series + '-chapter-') === -1) continue;

            const inner = m[2];
            const numM = inner.match(/<span class="chapternum">([\s\S]*?)<\/span>/i);
            const dateM = inner.match(/<span class="chapterdate">([\s\S]*?)<\/span>/i);
            const title = numM ? stripTags(numM[1]) : stripTags(inner);
            // Abaikan tombol seperti "New Chapter" / "First Chapter"
            if (!numM && !/^Chapter\s*\d/i.test(title)) continue;

            seen.add(link);
            out.push({
                id: link,
                title: title,
                endpoint: link,
                date: dateM ? stripTags(dateM[1]) : ''
            });
        }
        return out;
    };

    let list = collect(true);
    if (list.length === 0) list = collect(false);
    return list;
}

var KonmikExtension = {
    // 1. Ambil Daftar Komik
    async getList(page, query, filters) {
        page = page || 1;
        let url;

        if (query && query.trim()) {
            const q = encodeURIComponent(query.trim());
            url = page > 1 ? `${BASE}/page/${page}/?s=${q}` : `${BASE}/?s=${q}`;
        } else {
            const sort = (filters && filters.sort === 'popular') ? 'popular' : 'update';
            url = `${BASE}/manga/?page=${page}&order=${sort}`;
        }

        const html = await fetchHtml(url);
        let cards = parseCardsGeneric(html);
        if (cards.length === 0) cards = parseCards(html);

        // Cadangan: kalau halaman daftar kosong, pakai halaman beranda (Latest Update)
        if (cards.length === 0 && !(query && query.trim())) {
            const alt = page > 1 ? `${BASE}/page/${page}/` : `${BASE}/`;
            cards = parseCardsGeneric(await fetchHtml(alt));
        }
        return { manga_list: cards };
    },

    // 2. Ambil Detail Komik
    async getDetail(slug) {
        let url = slug;
        if (!url.startsWith('http')) {
            url = slug.startsWith('/') ? BASE + slug : BASE + '/manga/' + slug + '/';
        }
        const html = await fetchHtml(url);

        let title = '';
        const t1 = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) ||
                   html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (t1) title = stripTags(t1[1]);

        let cover = '';
        const og = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (og) cover = fixUrl(og[1]);
        if (!cover) {
            const th = html.match(/<div class="thumb"[^>]*>([\s\S]*?)<\/div>/i);
            if (th) {
                const img = th[1].match(/<img[^>]*>/i);
                if (img) cover = pickImg(img[0]);
            }
        }

        let description = '';
        const d1 = html.match(/<div class="entry-content[^"]*"[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
        if (d1) {
            description = decodeHtml(
                d1[1]
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/p>/gi, '\n')
                    .replace(/<[^>]+>/g, '')
            ).replace(/\n{2,}/g, '\n').trim();
        }
        if (!description) {
            const d2 = html.match(/<meta property="og:description" content="([^"]*)"/i);
            if (d2) description = decodeHtml(d2[1]).trim();
        }

        let author = '';
        const a1 = html.match(/Author\s*<\/b>\s*<span>([^<]*)</i) ||
                   html.match(/Author\s*(?:<[^>]+>\s*)+([^<]+)/i);
        if (a1) author = decodeHtml(a1[1]).trim();
        let artist = '';
        const a2 = html.match(/Artist\s*<\/b>\s*<span>([^<]*)</i) ||
                   html.match(/Artist\s*(?:<[^>]+>\s*)+([^<]+)/i);
        if (a2) artist = decodeHtml(a2[1]).trim();

        let rating = '';
        const r1 = html.match(/itemprop="ratingValue"[^>]*>([\d.]+)</i) ||
                   html.match(/class="num"[^>]*>([\d.]+)</i);
        if (r1) rating = r1[1];

        const genres = [];
        const gre = /<a[^>]+href="https?:\/\/komiklab\.cc\/genres\/[^"]+"[^>]*>([^<]+)<\/a>/gi;
        let gm;
        while ((gm = gre.exec(html)) !== null) {
            const g = decodeHtml(gm[1]).trim();
            if (g && !genres.includes(g) && genres.length < 25) genres.push(g);
        }

        // Daftar chapter (terbaru di atas, sama seperti di situs)
        const chapters = parseChapters(html, url);

        return {
            title: title || 'Unknown Title',
            cover_url: cover,
            description: description || 'Tidak ada deskripsi.',
            author: author,
            artist: artist || author,
            rating: rating || '-',
            views: '-',
            genres: genres,
            chapters: chapters
        };
    },

    // 3. Ambil Gambar Chapter
    async getChapterImages(endpoint) {
        const url = endpoint.startsWith('http') ? endpoint : BASE + endpoint;
        const html = await fetchHtml(url);
        let images = [];

        // Cara 1: tema MangaReader menaruh daftar gambar di script ts_reader.run({... "images":[...] ...})
        const im = html.match(/"images"\s*:\s*(\[[^\]]*\])/);
        if (im) {
            try {
                const arr = JSON.parse(im[1]);
                images = arr.filter(u => typeof u === 'string' && u).map(fixUrl);
            } catch (e) {}
        }

        // Cara 2: tag <img> di area baca (termasuk di <noscript>)
        if (images.length === 0) {
            const area = html.match(/id="readerarea"[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>|<div class="chnav)/i);
            const scope = area ? area[1] : html;
            const re = /<img[^>]+(?:data-src|data-lazy-src|src)="(https?:\/\/[^"]+\.(?:jpe?g|png|webp|avif)[^"]*)"/gi;
            let m;
            while ((m = re.exec(scope)) !== null) {
                const u = fixUrl(m[1]);
                if (/\/wp-content\/themes\//.test(u)) continue;
                if (!images.includes(u)) images.push(u);
            }
        }

        // Cara 3: gambar dari domain images.komiklab.cc di mana pun
        if (images.length === 0) {
            const re2 = /https?:\\?\/\\?\/images\.komiklab\.cc[^"'\s<>\\]*(?:\\\/[^"'\s<>\\]*)*\.(?:jpe?g|png|webp|avif)/gi;
            let m2;
            while ((m2 = re2.exec(html)) !== null) {
                const u = fixUrl(m2[0].replace(/\\\//g, '/'));
                if (!images.includes(u)) images.push(u);
            }
        }

        return images;
    }
};
