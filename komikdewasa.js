// ID: ext_komikdewasa
// NAME: Komik Dewasa (ID)
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #365FAF
// ICON: https://i3.wp.com/komikdewasa.art/wp-content/uploads/2022/05/cropped-Screenshot_20220509_010230_1-32x32.jpg
// REFERER: https://komikdewasa.art/

// Situs WordPress dengan tema MangaStream. Konten dewasa (18+).
// Semua data dibaca dari HTML memakai RegExp (tanpa JSON.parse, tanpa DOM).

const BASE = 'https://komikdewasa.art';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': BASE + '/',
};

async function fetchHtml(url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' - ' + url);
    return await res.text();
}

function decode(str) {
    if (!str) return '';
    return str
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanCover(url) {
    if (!url) return '';
    return url.replace(/&amp;/g, '&').replace(/\?resize=[^"'\s]*$/, '');
}

// Potong HTML dari penanda awal sampai penanda akhir (kalau tidak ketemu, pakai seluruhnya)
function section(html, startMark, endMark) {
    let s = startMark ? html.indexOf(startMark) : 0;
    if (s < 0) s = 0;
    let e = endMark ? html.indexOf(endMark, s) : -1;
    if (e < 0) e = html.length;
    return html.slice(s, e);
}

function parseCards(html) {
    const re = /<div class="bsx">\s*<a href="([^"]+)"\s+title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const out = [];
    const seen = {};
    let m;
    while ((m = re.exec(html)) !== null) {
        const url = m[1];
        if (seen[url]) continue;
        seen[url] = true;
        const inner = m[3];
        const img = inner.match(/<img[^>]+src="([^"]+)"/);
        const ch = inner.match(/<div class="epxs">([^<]*)<\/div>/);
        const sc = inner.match(/<div class="numscore">([^<]*)<\/div>/);
        const tt = inner.match(/<div class="tt">([\s\S]*?)<\/div>/);
        out.push({
            id: url,
            title: decode(tt ? tt[1] : m[2]) || decode(m[2]),
            cover_url: cleanCover(img ? img[1] : ''),
            latest_chapter: ch ? decode(ch[1]) : '',
            rating: sc ? decode(sc[1]) : '-',
            views: '-',
        });
    }
    return out;
}

var KonmikExtension = {
    async getList(page, query, filters) {
        page = parseInt(page, 10) || 1;
        const q = query ? String(query).trim() : '';
        const sort = filters && filters.sort ? filters.sort : 'latest';

        // Pencarian: /?s=kata  (halaman berikut: /page/N/?s=kata)
        if (q) {
            const url = (page > 1 ? BASE + '/page/' + page + '/' : BASE + '/') + '?s=' + encodeURIComponent(q);
            const html = await fetchHtml(url);
            return { manga_list: parseCards(section(html, 'class="listupd"', 'class="pagination"')) };
        }

        // Genre (opsional): filters.genre = 'doujinshi'
        if (filters && filters.genre) {
            const g = String(filters.genre).trim();
            const url = BASE + '/genres/' + encodeURIComponent(g) + '/' + (page > 1 ? 'page/' + page + '/' : '');
            const html = await fetchHtml(url);
            return { manga_list: parseCards(section(html, 'class="listupd"', 'class="pagination"')) };
        }

        // Populer: arsip /komik/?order=popular (kalau gagal, jatuh ke Latest Update)
        if (sort === 'popular') {
            try {
                const html = await fetchHtml(BASE + '/komik/?page=' + page + '&order=popular');
                const cards = parseCards(section(html, 'class="listupd"', 'class="pagination"'));
                if (cards.length) return { manga_list: cards };
            } catch (e) { /* lanjut ke latest */ }
        }

        // Latest Update dari beranda (/page/N/)
        const html = await fetchHtml(page > 1 ? BASE + '/page/' + page + '/' : BASE + '/');
        const latest = section(html, '<h2>Latest Update</h2>', 'class="pagination"');
        return { manga_list: parseCards(latest) };
    },

    async getDetail(slug) {
        const url = String(slug).indexOf('http') === 0 ? slug : BASE + '/komik/' + slug + '/';
        const html = await fetchHtml(url);

        const t = html.match(/<h1 class="entry-title"[^>]*>([\s\S]*?)<\/h1>/);
        const title = t ? decode(t[1]) : 'Tanpa Judul';

        const thumb = section(html, 'class="thumb"', '</div>');
        const ci = thumb.match(/<img[^>]+src="([^"]+)"/);
        const cover = cleanCover(ci ? ci[1] : '');

        const d = html.match(/<div class="entry-content entry-content-single"[^>]*>([\s\S]*?)<\/div>/);
        let desc = d ? decode(d[1]) : '';
        const alt = html.match(/<td>Alternative<\/td>\s*<td>([\s\S]*?)<\/td>/);
        if (alt && decode(alt[1])) desc = (desc ? desc + '\n\n' : '') + 'Alternatif: ' + decode(alt[1]);
        if (!desc) desc = 'Tidak ada deskripsi.';

        const st = html.match(/<td>Status<\/td>\s*<td>([\s\S]*?)<\/td>/);
        if (st && decode(st[1])) desc += '\n\nStatus: ' + decode(st[1]);

        const rt = html.match(/itemprop="ratingValue"[^>]*>([\d.]+)</);
        const rating = rt ? rt[1] : '-';

        const genres = [];
        const gblock = section(html, 'class="seriestugenre"', '</div>');
        const gre = /<a href="[^"]*\/genres\/[^"]*"[^>]*>([^<]+)<\/a>/g;
        let gm;
        while ((gm = gre.exec(gblock)) !== null) {
            const g = decode(gm[1]);
            if (g && genres.indexOf(g) === -1) genres.push(g);
        }

        const chapters = [];
        const clist = section(html, 'id="chapterlist"', '</ul>');
        const cre = /<div class="eph-num">\s*<a href="([^"]+)">\s*<span class="chapternum">([\s\S]*?)<\/span>\s*(?:<span class="chapterdate">([\s\S]*?)<\/span>)?/g;
        let cm;
        while ((cm = cre.exec(clist)) !== null) {
            chapters.push({
                id: cm[1],
                title: decode(cm[2]) || 'Chapter',
                endpoint: cm[1],
                date: cm[3] ? decode(cm[3]) : '-',
            });
        }

        return {
            title: title,
            cover_url: cover,
            description: desc,
            author: 'Unknown',
            artist: 'Unknown',
            rating: rating,
            views: '-',
            genres: genres.length ? genres : ['Komik Dewasa'],
            chapters: chapters,
        };
    },

    async getChapterImages(url) {
        const html = await fetchHtml(url);
        const images = [];

        // 1) Data pembaca: ts_reader.run({... "images":["https:\/\/...jpg", ...] ...})
        const tr = html.indexOf('ts_reader.run');
        if (tr >= 0) {
            const k = html.indexOf('"images"', tr);
            const open = k >= 0 ? html.indexOf('[', k) : -1;
            if (open >= 0) {
                let inStr = false;
                let end = -1;
                for (let i = open + 1; i < html.length; i++) {
                    const ch = html.charAt(i);
                    if (inStr) {
                        if (ch === '\\') i++;
                        else if (ch === '"') inStr = false;
                    } else if (ch === '"') {
                        inStr = true;
                    } else if (ch === ']') {
                        end = i;
                        break;
                    }
                }
                if (end > 0) {
                    const body = html.slice(open + 1, end);
                    const re = /"((?:[^"\\]|\\.)*)"/g;
                    let m;
                    while ((m = re.exec(body)) !== null) {
                        const u = m[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
                        if (/^https?:\/\//.test(u)) images.push(u);
                    }
                }
            }
        }
        if (images.length) return images;

        // 2) Cadangan: <img> di dalam #readerarea
        const area = section(html, 'id="readerarea"', 'class="chnav');
        const ire = /<img[^>]+src="(https?:\/\/[^"]+)"/g;
        let im;
        while ((im = ire.exec(area)) !== null) images.push(im[1]);
        return images;
    },
};
