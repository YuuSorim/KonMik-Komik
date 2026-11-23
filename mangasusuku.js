// ID: ext_mangasusuku
// NAME: Mangasusu
// TYPE: comic
// VERSION: 1.0.1
// COLOR: #3367D6
// ICON: https://mangasusuku.com/wp-content/uploads/2021/04/saber.png
// REFERER: https://mangasusuku.com/

const BASE = 'https://mangasusuku.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Genre yang sengaja tidak didukung oleh ekstensi ini.
const BLOCKED_GENRES = ['lolicon'];

const headers = {
    'User-Agent': USER_AGENT,
    'Referer': BASE + '/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
};

// ==========================================
// 1. HELPER
// ==========================================

async function fetchHtml(url) {
    const res = await fetch(url, { headers });
    const status = res.status || 200;
    if (status !== 200) throw new Error(`HTTP ${status} untuk ${url}`);
    return await res.text();
}

function decodeEntities(s) {
    return (s || '')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
    return decodeEntities((s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')).trim();
}

function first(regex, str, def = '') {
    const m = regex.exec(str || '');
    return m && m[1] !== undefined ? m[1].trim() : def;
}

function absUrl(u) {
    if (!u) return '';
    u = u.trim();
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return BASE + u;
    return u;
}

// Android memblokir lalu lintas http:// polos, jadi semua URL gambar dipaksa https://
function httpsUrl(u) {
    return (u || '').replace(/^http:\/\//i, 'https://');
}

// Ambil URL gambar dari tag <img ...> (mendukung lazy-load)
function imgSrc(tag) {
    if (!tag) return '';
    const attrs = ['data-src', 'data-lazy-src', 'data-original', 'src'];
    for (const a of attrs) {
        const m = new RegExp('\\s' + a + '="([^"]+)"', 'i').exec(tag);
        if (m && m[1] && !m[1].startsWith('data:')) return httpsUrl(absUrl(decodeEntities(m[1])));
    }
    return '';
}

// Hilangkan suffix ukuran thumbnail WordPress: -214x300.webp -> .webp
function fullCover(u) {
    return (u || '').replace(/-\d+x\d+(\.(?:jpe?g|png|webp|gif))(\?.*)?$/i, '$1');
}

function isMangaUrl(u) {
    return /\/komik\/[^\/?#]+\/?$/i.test(u || '');
}

// ==========================================
// 2. PARSER DAFTAR KOMIK
// ==========================================

function parseCards(html) {
    const list = [];
    const seen = new Set();

    // Pola utama: <div class="bs"> ... </div> (tema MangaStream)
    const chunks = html.split(/<div class="bs[ "]/i).slice(1);
    for (const chunk of chunks) {
        const href = first(/<a[^>]*href="([^"]+)"/i, chunk);
        if (!href || !isMangaUrl(href) || seen.has(href)) continue;

        let title = first(/<a[^>]*title="([^"]+)"/i, chunk);
        if (!title) title = stripTags(first(/<div class="tt"[^>]*>([\s\S]*?)<\/div>/i, chunk));
        if (!title) continue;

        const cover = fullCover(imgSrc(first(/(<img[^>]*>)/i, chunk)));
        const rating = first(/class="numscore"[^>]*>\s*([\d.]+)/i, chunk, '0.0');

        seen.add(href);
        list.push({
            id: href,
            title: decodeEntities(title),
            cover_url: cover,
            rating: rating,
            views: '-'
        });
    }
    if (list.length > 0) return list;

    // Cadangan: cari semua anchor ke /komik/<slug>/
    const anchorRe = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchorRe.exec(html)) !== null) {
        const href = m[1];
        if (!isMangaUrl(href) || seen.has(href)) continue;
        const inner = m[2];
        const title = decodeEntities(first(/title="([^"]+)"/i, m[0]) || stripTags(inner));
        if (!title) continue;
        const cover = fullCover(imgSrc(first(/(<img[^>]*>)/i, inner)));
        seen.add(href);
        list.push({
            id: href,
            title: title,
            cover_url: cover,
            rating: first(/class="numscore"[^>]*>\s*([\d.]+)/i, inner, '0.0'),
            views: '-'
        });
    }
    return list;
}

// ==========================================
// 3. KONTRAK WAJIB KONMIK EXTENSION
// ==========================================

var KonmikExtension = {

    // -- Katalog / pencarian / filter --
    async getList(page, query, filters) {
        const pageNum = page || 1;
        const params = [];
        let url;

        if (filters && filters.genre) {
            const g = String(filters.genre).toLowerCase().trim().replace(/\s+/g, '-');
            if (BLOCKED_GENRES.indexOf(g) !== -1) return { manga_list: [] };
            params.push('genre%5B%5D=' + encodeURIComponent(g));
        }

        if (query) {
            // Pencarian bawaan WordPress
            url = pageNum > 1
                ? `${BASE}/page/${pageNum}/?s=${encodeURIComponent(query)}`
                : `${BASE}/?s=${encodeURIComponent(query)}`;
        } else {
            if (pageNum > 1) params.push('page=' + pageNum);
            let order = 'update';
            if (filters && filters.sort) order = String(filters.sort).toLowerCase();
            params.push('order=' + encodeURIComponent(order));
            if (filters && filters.status) params.push('status=' + encodeURIComponent(String(filters.status).toLowerCase()));
            if (filters && filters.type) params.push('type=' + encodeURIComponent(String(filters.type).toLowerCase()));
            url = `${BASE}/komik/?` + params.join('&');
        }

        let html;
        try {
            html = await fetchHtml(url);
        } catch (e) {
            // Halaman di luar jangkauan (404) berarti sudah habis
            if (pageNum > 1) return { manga_list: [] };
            throw e;
        }
        return { manga_list: parseCards(html) };
    },

    // -- Detail komik & daftar chapter --
    async getDetail(slug) {
        const url = slug.startsWith('http') ? slug : `${BASE}/komik/${slug.replace(/^\/+|\/+$/g, '')}/`;
        const html = await fetchHtml(url);

        const title = decodeEntities(
            stripTags(first(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i, html)) ||
            stripTags(first(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html)) ||
            'Tanpa Judul'
        );

        // Cover
        let cover = first(/property="og:image"[^>]*content="([^"]+)"/i, html) ||
                    first(/content="([^"]+)"[^>]*property="og:image"/i, html);
        if (!cover) {
            const thumb = first(/<div class="thumb"[^>]*>([\s\S]*?)<\/div>/i, html);
            cover = imgSrc(first(/(<img[^>]*>)/i, thumb));
        }
        cover = fullCover(httpsUrl(absUrl(decodeEntities(cover))));

        // Deskripsi
        let desc = stripTags(first(/<div class="entry-content[^"]*"[^>]*(?:itemprop="description")?[^>]*>([\s\S]*?)<\/div>/i, html));
        if (!desc) desc = decodeEntities(first(/property="og:description"[^>]*content="([^"]*)"/i, html));
        if (!desc) desc = 'Tidak ada deskripsi';

        // Rating
        const rating = first(/class="num"[^>]*(?:itemprop="ratingValue")?[^>]*>\s*([\d.]+)/i, html) ||
                       first(/itemprop="ratingValue"[^>]*>\s*([\d.]+)/i, html) || '0.0';

        // Genre
        const genres = [];
        const genreBlock = first(/<span class="mgen"[^>]*>([\s\S]*?)<\/span>/i, html);
        const genreSrc = genreBlock || html;
        const genreRe = /<a[^>]*href="[^"]*\/genres\/([^\/"]+)\/?"[^>]*>([\s\S]*?)<\/a>/gi;
        let gm;
        while ((gm = genreRe.exec(genreSrc)) !== null) {
            const name = stripTags(gm[2]);
            if (!name || BLOCKED_GENRES.indexOf(gm[1].toLowerCase()) !== -1) continue;
            if (genres.indexOf(name) === -1) genres.push(name);
            if (genres.length >= 20) break;
        }

        // Author & Artist (mendukung layout tabel dan layout .imptdt)
        const pickField = (label) => {
            let v = first(new RegExp('<td[^>]*>\\s*' + label + '\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>', 'i'), html);
            if (!v) v = first(new RegExp('<b>\\s*' + label + '\\s*<\\/b>\\s*([\\s\\S]*?)<\\/', 'i'), html);
            if (!v) v = first(new RegExp(label + '\\s*<i>([\\s\\S]*?)<\\/i>', 'i'), html);
            v = stripTags(v);
            return v && v !== '-' ? v : '?';
        };
        const author = pickField('Author');
        const artist = pickField('Artist');

        // Daftar chapter (terbaru di atas, sesuai urutan situs)
        const chapters = [];
        const seenCh = new Set();
        const listStart = html.search(/id="chapterlist"/i);
        const listHtml = listStart >= 0 ? html.slice(listStart) : html;
        const items = listHtml.split(/<li[\s>]/i).slice(1);
        for (const it of items) {
            const href = first(/<a[^>]*href="([^"]+)"/i, it);
            if (!href || seenCh.has(href) || !/-chapter-|chapter/i.test(href) || isMangaUrl(href)) continue;
            let chTitle = stripTags(first(/<span class="chapternum"[^>]*>([\s\S]*?)<\/span>/i, it));
            if (!chTitle) chTitle = stripTags(first(/<a[^>]*>([\s\S]*?)<\/a>/i, it));
            const date = stripTags(first(/<span class="chapterdate"[^>]*>([\s\S]*?)<\/span>/i, it));
            seenCh.add(href);
            chapters.push({
                id: href,
                title: chTitle || 'Chapter',
                date: date || ''
            });
        }

        // Pastikan urutan descending berdasarkan nomor chapter di URL (jika terbaca)
        const num = (c) => {
            const m = /chapter-(\d+)(?:-(\d+))?/i.exec(c.id);
            return m ? parseFloat(m[1] + (m[2] ? '.' + m[2] : '')) : -1;
        };
        if (chapters.length > 1 && chapters.every(c => num(c) >= 0)) {
            chapters.sort((a, b) => num(b) - num(a));
        }

        return {
            title: title,
            cover_url: cover,
            description: desc,
            rating: rating,
            views: '-',
            genres: genres,
            author: author,
            artist: artist,
            chapters: chapters
        };
    },

    // -- Gambar halaman chapter --
    async getChapterImages(chapterId) {
        const url = chapterId.startsWith('http') ? chapterId : `${BASE}/${chapterId.replace(/^\/+/, '')}`;
        const html = await fetchHtml(url);
        const images = [];
        const seen = new Set();
        const IMG_EXT = /\.(?:jpe?g|png|webp|avif|gif)(?:[?#].*)?$/i;

        const push = (u) => {
            u = httpsUrl(absUrl(decodeEntities((u || '').replace(/\\\//g, '/')).trim()));
            if (!u || seen.has(u)) return;
            if (!IMG_EXT.test(u)) return;                       // hanya file gambar
            if (/readerarea\.svg|\/themes\/|logo|favicon|banner/i.test(u)) return;
            seen.add(u);
            images.push(u);
        };

        // Jalur 1: JSON dari ts_reader.run({... "images":[...] ...})
        const jsonImgs = first(/"images"\s*:\s*\[([\s\S]*?)\]/i, html);
        if (jsonImgs) {
            const re = /"([^"]+)"/g;
            let m;
            while ((m = re.exec(jsonImgs)) !== null) push(m[1]);
        }
        if (images.length > 0) return images;

        // Jalur 2: tag <img> di dalam #readerarea
        const start = html.search(/id="readerarea"/i);
        let area = '';
        if (start >= 0) {
            let end = html.indexOf('<div class="chnav', start + 20);
            if (end < 0) end = Math.min(html.length, start + 300000);
            area = html.slice(start, end);
            const re = /<img[^>]*>/gi;
            let m;
            while ((m = re.exec(area)) !== null) push(imgSrc(m[0]));
        }
        if (images.length > 0) return images;

        // Jalur 3 (cadangan): cari semua URL gambar mentah di area baca
        const rawArea = area || html;
        const rawRe = /https?:\/\/[^"'\s<>\\]+\.(?:jpe?g|png|webp|avif|gif)/gi;
        let rm;
        while ((rm = rawRe.exec(rawArea)) !== null) push(rm[0]);
        if (images.length > 0) return images;

        // Tidak ada gambar: lempar error supaya reader tidak loading selamanya
        throw new Error('Gambar chapter tidak ditemukan (panjang HTML ' + html.length + ')');
    }
};
