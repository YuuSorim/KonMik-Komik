// ID: ext_ryukomik
// NAME: Ryukomik
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #7C5CFF
// ICON: https://www.google.com/s2/favicons?domain=ryukomik.com&sz=64
// REFERER: https://ryukomik.com/

const SITE = 'https://ryukomik.com';
const API = 'https://api.ryukomik.com';
const SOURCE = 'kiryuu'; // sumber katalog: https://api.ryukomik.com/{SOURCE}/pustaka

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': 'https://ryukomik.com/',
};

async function fetchText(url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return await res.text();
}

function decodeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
}

function stripTags(str) {
    return decodeHtml((str || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function toAbsolute(path) {
    if (!path) return '';
    if (path.indexOf('http') === 0) return path;
    return SITE + (path.charAt(0) === '/' ? '' : '/') + path;
}

var KonmikExtension = {
    // ---------- KATALOG / PENCARIAN ----------
    async getList(page, query, filters) {
        page = page || 1;
        let url = API + '/' + SOURCE + '/pustaka?page=' + page + '&orderby=modified';
        if (query && query.trim().length > 0) {
            // CATATAN: parameter pencarian belum diverifikasi. Ganti 'search' bila URL asli berbeda.
            url += '&search=' + encodeURIComponent(query.trim());
        }

        const text = await fetchText(url);
        let json;
        try {
            json = JSON.parse(text);
        } catch (e) {
            return { manga_list: [] };
        }
        const data = (json && json.data) || [];

        const list = [];
        for (const it of data) {
            if (!it || !it.slug) continue;
            const source = it.source || SOURCE;
            list.push({
                id: source + '/' + it.slug,
                title: it.title || it.slug,
                cover_url: it.image || '',
                latest_chapter: it.chapter_terbaru || '',
                rating: '-',
                views: '-'
            });
        }
        return { manga_list: list };
    },

    // ---------- DETAIL KOMIK ----------
    // slug = "sumber/slug", contoh: "josei/starting-the-villainess-life-with-0-gold"
    async getDetail(slug) {
        let url;
        if (slug.indexOf('http') === 0) url = slug;
        else if (slug.indexOf('/komik/') === 0) url = SITE + slug;
        else if (slug.indexOf('/') > -1) url = SITE + '/komik/' + slug;
        else url = SITE + '/komik/' + SOURCE + '/' + slug;

        const raw = await fetchText(url);
        const html = raw.replace(/\s+/g, ' ');

        // Judul
        let title = '';
        const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (h1) title = stripTags(h1[1]);
        if (!title) title = slug;

        // Cover
        let cover = '';
        const og = html.match(/property="og:image" content="([^"]+)"/i);
        if (og) cover = decodeHtml(og[1]);

        // Sinopsis (di halaman terpotong oleh situs)
        let description = 'Tidak ada deskripsi.';
        const syn = html.match(/<p class="[^"]*line-clamp-3[^"]*">([\s\S]*?)<\/p>/i);
        if (syn) description = stripTags(syn[1]);

        // Genre
        const genres = [];
        const gRe = /<a [^>]*href="\/genre\/[^"]+"[^>]*>([^<]+)<\/a>/gi;
        let gm;
        while ((gm = gRe.exec(html)) !== null) {
            const g = stripTags(gm[1]);
            if (g && genres.indexOf(g) === -1) genres.push(g);
        }
        if (genres.length === 0) genres.push('Komik');

        // Daftar chapter (terbaru -> terlama)
        const chapters = [];
        const seen = {};
        const cRe = /<a [^>]*href="(\/chapter\/[^"]+)"[^>]*>\s*<div class="min-w-0">[\s\S]*?<span class="[^"]*">([^<]+)<\/span><\/div>(?:<span class="[^"]*"><span>([^<]*)<\/span>)?/gi;
        let cm;
        while ((cm = cRe.exec(html)) !== null) {
            const path = cm[1];
            if (seen[path]) continue;
            seen[path] = true;
            const full = SITE + path;
            chapters.push({
                id: full,
                title: stripTags(cm[2]),
                endpoint: full,
                date: cm[3] ? stripTags(cm[3]) : '-'
            });
        }

        return {
            title: title,
            cover_url: cover,
            description: description,
            author: '-',
            artist: '-',
            rating: '-',
            views: '-',
            genres: genres,
            chapters: chapters
        };
    },

    // ---------- GAMBAR CHAPTER ----------
    async getChapterImages(endpoint) {
        const url = toAbsolute(endpoint);
        const html = await fetchText(url);
        const images = [];

        // Cara 1: tag <img data-page="N" src="...">
        const imgRe = /<img[^>]*data-page="(\d+)"[^>]*src="([^"]+)"/gi;
        let m;
        const byPage = {};
        while ((m = imgRe.exec(html)) !== null) {
            byPage[parseInt(m[1], 10)] = decodeHtml(m[2]);
        }
        const keys = Object.keys(byPage).map(Number).sort(function (a, b) { return a - b; });
        for (const k of keys) images.push(byPage[k]);

        // Cara 2 (cadangan): array "images" di data Next.js
        if (images.length === 0) {
            const arr = html.match(/\\"images\\":\[((?:\\"[^"\\]+\\",?)+)\]/);
            if (arr) {
                const urlRe = /\\"(https?:[^"\\]+)\\"/g;
                let u;
                while ((u = urlRe.exec(arr[1])) !== null) images.push(decodeHtml(u[1]));
            }
        }
        return images;
    }
};
