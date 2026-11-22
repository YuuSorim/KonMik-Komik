// ID: ext_thrive
// NAME: Thrive.moe (ID)
// TYPE: comic
// VERSION: 1.3.0
// COLOR: #7C5CFF
// ICON: https://www.google.com/s2/favicons?domain=thrive.moe&sz=64
// REFERER: https://thrive.moe/

// thrive.moe memakai Next.js. Datanya diambil dari file JSON
// /_next/data/<buildId>/... (buildId berubah tiap deploy, jadi diambil otomatis
// dari halaman utama). Tidak memakai api.mangadex.org (diblokir ISP).

const BASE = 'https://thrive.moe';
const CDN = 'https://cdn.thrive.moe';
const PAGE_SIZE = 24;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': BASE + '/',
    // Minta respons tanpa kompresi: respons gzip bisa terpotong di jembatan fetch aplikasi
    'Accept-Encoding': 'identity',
};

let cachedBuildId = '';

function extractId(str) {
    const m = String(str || '').match(UUID_RE);
    if (!m) throw new Error('ID tidak valid: ' + str);
    return m[0].toLowerCase();
}

async function getBuildId(force) {
    if (cachedBuildId && !force) return cachedBuildId;
    const res = await fetch(BASE + '/', { headers });
    const html = await res.text();
    const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
    if (!m) throw new Error('buildId tidak ditemukan (HTTP ' + res.status + '): ' + html.slice(0, 120));
    cachedBuildId = m[1];
    return cachedBuildId;
}

// ---- Fallback tanpa JSON.parse -------------------------------------------
// Beberapa lingkungan menggagalkan JSON.parse pada respons yang valid, jadi
// kalau parse gagal, data dibaca langsung dari teks mentah dengan RegExp.
function unq(str) {
    if (str === null || str === undefined) return '';
    try { return JSON.parse('"' + str + '"'); } catch (e) { return String(str).replace(/\\"/g, '"').replace(/\\n/g, '\n'); }
}

// Ambil nilai string/angka dari satu blok objek: "key": "nilai"
function fld(block, key) {
    const m = block.match(new RegExp('"' + key + '"\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|(-?\\d+(?:\\.\\d+)?)|(null|true|false))'));
    if (!m) return null;
    if (m[1] !== undefined) return unq(m[1]);
    if (m[2] !== undefined) return m[2];
    return null;
}

// Ambil array string dari teks mentah: "key": ["a","b"]
function rawStrings(raw, key, from) {
    const start = raw.indexOf('"' + key + '"', from || 0);
    if (start < 0) return [];
    const open = raw.indexOf('[', start);
    const close = raw.indexOf(']', open);
    if (open < 0 || close < 0) return [];
    const out = [];
    const re = /"((?:[^"\\]|\\.)*)"/g;
    let m;
    const body = raw.slice(open + 1, close);
    while ((m = re.exec(body)) !== null) out.push(unq(m[1]));
    return out;
}

// Ambil daftar objek datar dari array bernama `key` (mis. terbaru, terpopuler, res)
function rawObjects(raw, key) {
    const start = raw.indexOf('"' + key + '"');
    if (start < 0) return [];
    const open = raw.indexOf('[', start);
    if (open < 0) return [];
    let end = raw.indexOf(']', open);
    if (end < 0) end = raw.length;
    const body = raw.slice(open + 1, end);
    const blocks = body.match(/\{[^{}]*\}/g) || [];
    return blocks.map(b => ({
        id: fld(b, 'id'),
        title: fld(b, 'title'),
        cover: fld(b, 'cover'),
        chapter_id: fld(b, 'chapter_id'),
        chapter_number: fld(b, 'chapter_number'),
    }));
}

function rawDetail(raw) {
    const cl = raw.indexOf('"chapterlist"');
    const head = cl >= 0 ? raw.slice(0, cl) : raw;
    const tm = head.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"alt_title"/);
    const artistIdx = head.indexOf('"artist"');
    const chapterlist = [];
    if (cl >= 0) {
        const open = raw.indexOf('[', cl);
        const blocks = raw.slice(open + 1).match(/\{[^{}]*\}/g) || [];
        for (const b of blocks) {
            const cid = fld(b, 'chapter_id');
            if (!cid) continue;
            chapterlist.push({
                chapter_id: cid,
                created_at: fld(b, 'created_at'),
                chapter_title: fld(b, 'chapter_title'),
                chapter_number: fld(b, 'chapter_number'),
            });
        }
    }
    return {
        title: tm ? unq(tm[1]) : '',
        desc_ID: fld(head, 'desc_ID'),
        desc: { en: '' },
        image: fld(head, 'image'),
        author: rawStrings(head, 'author'),
        artist: rawStrings(head, 'artist'),
        tags: rawStrings(head, 'tags', artistIdx < 0 ? 0 : artistIdx),
        chapterlist: chapterlist,
    };
}

function rawRead(raw) {
    const arr = rawStrings(raw, 'image');
    return { image: arr, prefix: fld(raw, 'prefix') };
}

// path contoh: '/title/<id>.json?id=<id>' atau '/index.json'
async function getJson(path) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
        const build = await getBuildId(attempt > 0);
        const url = BASE + '/_next/data/' + build + path;
        const res = await fetch(url, { headers });
        const text = await res.text();
        if (res.status === 404 && attempt === 0) { lastErr = new Error('HTTP 404: ' + path); continue; }
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + path);
        if (text.trim().charAt(0) !== '{') throw new Error('Respons bukan JSON: ' + text.slice(0, 120));
        let json = null;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        if (!json) return { __raw: text };
        return json.pageProps || json;
    }
    throw lastErr || new Error('Gagal memuat ' + path);
}

function coverFrom(mangaId, url) {
    if (!url) return '';
    if (url.indexOf('cdn.thrive.moe') !== -1) return url;
    const file = String(url).split('?')[0].split('/').pop();
    return file ? CDN + '/covers/' + mangaId + '/' + file + '.512.jpg' : url;
}

function formatDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '-';
    return parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
}

function toItem(n) {
    const id = String(n.id).toLowerCase();
    const num = n.chapter_number;
    return {
        id: id,
        title: String(n.title).trim(),
        cover_url: coverFrom(id, n.cover || ''),
        latest_chapter: num ? 'Ch. ' + num : '',
        rating: '-',
        views: '-',
    };
}

function toItems(arr) {
    const out = [];
    const seen = {};
    for (const n of arr || []) {
        if (!n || !n.id || !n.title || seen[n.id]) continue;
        seen[n.id] = true;
        out.push(toItem(n));
    }
    return out;
}

var KonmikExtension = {
    async getList(page, query, filters) {
        page = page || 1;
        const q = query ? String(query).trim() : '';
        const sort = filters && filters.sort ? filters.sort : 'popular';

        // Pencarian: /search?q=... (hasil di pageProps.res, tanpa paginasi)
        if (q) {
            if (page > 1) return { manga_list: [] };
            const props = await getJson('/search.json?q=' + encodeURIComponent(q));
            return { manga_list: toItems(props.__raw ? rawObjects(props.__raw, 'res') : props.res) };
        }

        // Katalog: halaman utama berisi terpopuler (50) dan terbaru (121); dipotong per halaman
        const props = await getJson('/index.json');
        const key = sort === 'latest' ? 'terbaru' : 'terpopuler';
        const all = toItems(props.__raw ? rawObjects(props.__raw, key) : props[key]);
        const start = (page - 1) * PAGE_SIZE;
        return { manga_list: all.slice(start, start + PAGE_SIZE) };
    },

    async getDetail(slug) {
        const id = extractId(slug);
        let p = await getJson('/title/' + id + '.json?id=' + id);
        if (p.__raw) p = rawDetail(p.__raw);

        const desc = p.desc_ID || (p.desc && (p.desc.id || p.desc.en)) || 'Tidak ada deskripsi.';
        const authors = (p.author || []).join(', ');
        const artists = (p.artist || []).join(', ');

        const chapters = [];
        const seen = {};
        for (const c of p.chapterlist || []) {
            const key = c.chapter_number ? String(c.chapter_number) : c.chapter_id;
            if (seen[key]) continue;
            seen[key] = true;
            let title;
            if (c.chapter_number) {
                title = 'Chapter ' + c.chapter_number + (c.chapter_title ? ' - ' + c.chapter_title : '');
            } else {
                title = c.chapter_title || 'Oneshot';
            }
            chapters.push({
                id: c.chapter_id,
                title: title,
                endpoint: c.chapter_id,
                date: formatDate(c.created_at),
            });
        }

        return {
            title: p.title || 'Tanpa Judul',
            cover_url: coverFrom(id, p.image),
            description: String(desc).trim(),
            author: authors || 'Unknown',
            artist: artists || authors || 'Unknown',
            rating: '-',
            views: '-',
            genres: (p.tags && p.tags.length) ? p.tags : ['Manga'],
            chapters: chapters,
        };
    },

    async getChapterImages(endpoint) {
        const id = extractId(endpoint);
        let p = await getJson('/read/' + id + '.json?id=' + id);
        if (p.__raw) p = rawRead(p.__raw);
        const prefix = p.prefix;
        return (p.image || []).map(f => CDN + '/data/' + prefix + '/' + f);
    },
};
