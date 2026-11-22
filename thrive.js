// ID: ext_thrive
// NAME: Thrive.moe (ID)
// TYPE: comic
// VERSION: 1.2.1
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

// JSON.parse yang tahan respons terpotong: buang bagian akhir yang rusak lalu tutup kurung
function parseLoose(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        const closers = [']}}', '}}', ']}}}', '}'];
        let end = text.length;
        for (let i = 0; i < 6; i++) {
            end = text.lastIndexOf('}', end - 1);
            if (end < 0) break;
            const head = text.slice(0, end + 1);
            for (const c of closers) {
                try { return JSON.parse(head + c); } catch (e2) { /* coba lagi */ }
            }
        }
        throw new Error('JSON rusak/terpotong (panjang ' + text.length + '): ' + e.message);
    }
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
        const json = parseLoose(text);
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
            return { manga_list: toItems(props.res) };
        }

        // Katalog: halaman utama berisi terpopuler (50) dan terbaru (121); dipotong per halaman
        const props = await getJson('/index.json');
        const all = toItems(sort === 'latest' ? props.terbaru : props.terpopuler);
        const start = (page - 1) * PAGE_SIZE;
        return { manga_list: all.slice(start, start + PAGE_SIZE) };
    },

    async getDetail(slug) {
        const id = extractId(slug);
        const p = await getJson('/title/' + id + '.json?id=' + id);

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
        const p = await getJson('/read/' + id + '.json?id=' + id);
        const prefix = p.prefix;
        return (p.image || []).map(f => CDN + '/data/' + prefix + '/' + f);
    },
};
