// ID: ext_thrive
// NAME: Thrive.moe (ID)
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #7C5CFF
// ICON: https://www.google.com/s2/favicons?domain=thrive.moe&sz=64
// REFERER: https://thrive.moe/

// thrive.moe adalah front-end Next.js yang "Powered by MangaDex":
// ID judul (/title/<uuid>) dan ID bab (/read/<uuid>) adalah UUID MangaDex,
// sedangkan daftar bab dirender di sisi klien (tidak ada di HTML).
// Karena itu ekstensi ini membaca data lewat API MangaDex (JSON), bukan RegExp HTML,
// dan hanya menampilkan konten berbahasa Indonesia seperti di thrive.moe.

const API = 'https://api.mangadex.org';
const COVER_CDN = 'https://cdn.thrive.moe/covers';
const LANG = 'id';
const PAGE_SIZE = 24;
const RATINGS = ['safe', 'suggestive', 'erotica'];
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://thrive.moe/',
};

function qs(params) {
    const parts = [];
    for (const key in params) {
        const v = params[key];
        if (v === undefined || v === null || v === '') continue;
        if (Array.isArray(v)) {
            for (const item of v) {
                parts.push(encodeURIComponent(key + '[]') + '=' + encodeURIComponent(item));
            }
        } else {
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
        }
    }
    return parts.join('&');
}

async function api(path, params) {
    const url = API + path + (params ? '?' + qs(params) : '');
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' - ' + path);
    return JSON.parse(await res.text());
}

function extractId(str) {
    const m = String(str || '').match(UUID_RE);
    if (!m) throw new Error('ID tidak valid: ' + str);
    return m[0].toLowerCase();
}

function pickTitle(attrs) {
    const t = attrs.title || {};
    if (t[LANG]) return t[LANG];
    if (t.en) return t.en;
    const first = Object.values(t)[0];
    if (first) return first;
    for (const alt of attrs.altTitles || []) {
        const v = alt[LANG] || alt.en;
        if (v) return v;
    }
    return 'Tanpa Judul';
}

function pickDescription(attrs) {
    const d = attrs.description || {};
    return (d[LANG] || d.en || Object.values(d)[0] || 'Tidak ada deskripsi.').trim();
}

function findRel(rels, type) {
    return (rels || []).filter(r => r.type === type);
}

function coverUrl(mangaId, rels) {
    const cover = findRel(rels, 'cover_art')[0];
    const file = cover && cover.attributes && cover.attributes.fileName;
    return file ? COVER_CDN + '/' + mangaId + '/' + file + '.512.jpg' : '';
}

function compact(n) {
    if (n === undefined || n === null) return '-';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

function formatDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '-';
    return parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
}

async function fetchStats(ids) {
    try {
        const data = await api('/statistics/manga', { manga: ids });
        return data.statistics || {};
    } catch (e) {
        return {};
    }
}

function ratingOf(stat) {
    const avg = stat && stat.rating && stat.rating.average;
    return avg ? avg.toFixed(1) : '-';
}

var KonmikExtension = {
    async getList(page, query, filters) {
        page = page || 1;
        const q = query ? String(query).trim() : '';
        const sort = filters && filters.sort ? filters.sort : 'popular';

        const params = {
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
            includes: ['cover_art'],
            availableTranslatedLanguage: [LANG],
            contentRating: RATINGS,
            hasAvailableChapters: 'true',
        };
        if (q) {
            params.title = q;
            params['order[relevance]'] = 'desc';
        } else if (sort === 'latest') {
            params['order[latestUploadedChapter]'] = 'desc';
        } else {
            params['order[followedCount]'] = 'desc';
        }

        const data = await api('/manga', params);
        const items = data.data || [];
        const stats = await fetchStats(items.map(i => i.id));

        const mangaList = items.map(item => {
            const a = item.attributes || {};
            const s = stats[item.id];
            return {
                id: item.id,
                title: pickTitle(a),
                cover_url: coverUrl(item.id, item.relationships),
                latest_chapter: a.lastChapter ? 'Ch. ' + a.lastChapter : '',
                rating: ratingOf(s),
                views: compact(s && s.follows),
            };
        });
        return { manga_list: mangaList };
    },

    async getDetail(slug) {
        const id = extractId(slug);
        const [detail, stats] = await Promise.all([
            api('/manga/' + id, { includes: ['cover_art', 'author', 'artist'] }),
            fetchStats([id]),
        ]);
        const item = detail.data;
        const a = item.attributes || {};
        const rels = item.relationships || [];

        const authors = findRel(rels, 'author').map(r => r.attributes && r.attributes.name).filter(Boolean);
        const artists = findRel(rels, 'artist').map(r => r.attributes && r.attributes.name).filter(Boolean);
        const genres = (a.tags || [])
            .map(t => t.attributes && t.attributes.name && (t.attributes.name.en || Object.values(t.attributes.name)[0]))
            .filter(Boolean);

        // Ambil semua bab berbahasa Indonesia (maks 500 per request)
        const chapters = [];
        const seen = {};
        let offset = 0;
        let total = 1;
        let guard = 0;
        while (offset < total && guard < 10) {
            const feed = await api('/manga/' + id + '/feed', {
                translatedLanguage: [LANG],
                contentRating: RATINGS,
                includeExternalUrl: 0,
                includeEmptyPages: 0,
                limit: 500,
                offset: offset,
                'order[chapter]': 'desc',
            });
            total = feed.total || 0;
            const rows = feed.data || [];
            if (rows.length === 0) break;
            for (const ch of rows) {
                const c = ch.attributes || {};
                if (c.pages === 0) continue;
                // Satu nomor bab bisa diunggah beberapa grup: ambil yang pertama saja
                const key = c.chapter ? (c.volume || '') + '|' + c.chapter : ch.id;
                if (seen[key]) continue;
                seen[key] = true;

                let title;
                if (c.chapter) {
                    title = 'Chapter ' + c.chapter + (c.title ? ' - ' + c.title : '');
                } else {
                    title = c.title || 'Oneshot';
                }
                chapters.push({
                    id: ch.id,
                    title: title,
                    endpoint: ch.id,
                    date: formatDate(c.readableAt || c.publishAt),
                });
            }
            offset += rows.length;
            guard++;
        }

        const s = stats[id];
        const author = authors.join(', ') || 'Unknown';
        return {
            title: pickTitle(a),
            cover_url: coverUrl(id, rels),
            description: pickDescription(a),
            author: author,
            artist: artists.join(', ') || author,
            rating: ratingOf(s),
            views: compact(s && s.follows),
            genres: genres.length ? genres : ['Manga'],
            chapters: chapters,
        };
    },

    async getChapterImages(endpoint) {
        const id = extractId(endpoint);
        const data = await api('/at-home/server/' + id);
        const base = data.baseUrl;
        const ch = data.chapter || {};
        if (ch.data && ch.data.length) {
            return ch.data.map(f => base + '/data/' + ch.hash + '/' + f);
        }
        return (ch.dataSaver || []).map(f => base + '/data-saver/' + ch.hash + '/' + f);
    },
};
