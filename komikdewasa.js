// ID: ext_komikdewasa
// NAME: Komik Dewasa (ID)
// TYPE: comic
// VERSION: 1.1.0
// COLOR: #365FAF
// ICON: https://i3.wp.com/komikdewasa.art/wp-content/uploads/2022/05/cropped-Screenshot_20220509_010230_1-32x32.jpg
// REFERER: https://komikdewasa.art/

// Situs WordPress dengan tema MangaStream. Konten dewasa (18+).
// Semua data dibaca dari HTML memakai RegExp (tanpa JSON.parse, tanpa DOM).

const BASE = 'https://komikdewasa.art';

// ---------------------------------------------------------------------------
// OPSIONAL - kalau situs menampilkan "Just a moment..." (tantangan Cloudflare) di app:
// buka komikdewasa.art di Chrome laptop sampai terbuka normal, lalu
//   1) F12 > Application > Cookies > https://komikdewasa.art > salin nilai "cf_clearance"
//   2) F12 > Console > ketik: navigator.userAgent  > salin hasilnya
// dan tempel di bawah. Cookie ini terikat ke jaringan (IP) dan User-Agent browser itu,
// dan akan kedaluwarsa (ulangi langkah di atas kalau katalog kosong lagi).
// Belum tentu berhasil: Cloudflare bisa menolaknya untuk klien non-browser.
const CF_CLEARANCE = '';   // contoh: 'AbCdEf123...-1700000000-1.2.1.1-xyz'
const BROWSER_UA = '';     // contoh: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/130.0.0.0 Safari/537.36'
// ---------------------------------------------------------------------------

const headers = {
    'User-Agent': BROWSER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': BASE + '/',
};
if (CF_CLEARANCE) headers['Cookie'] = 'cf_clearance=' + CF_CLEARANCE.replace(/^cf_clearance=/, '');

async function fetchHtml(url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' - ' + url + (res.status === 403 || res.status === 503 ? ' (kemungkinan tantangan Cloudflare; lihat bagian OPSIONAL di atas file)' : ''));
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

function attr(tag, name) {
    const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i'));
    return m ? (m[1] !== undefined ? m[1] : m[2]) : '';
}

function parseCards(html) {
    const out = [];
    const seen = {};
    const parts = html.split('<div class="bsx">');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        const aTag = block.match(/<a\s[^>]*>/);
        if (!aTag) continue;
        const url = attr(aTag[0], 'href');
        if (!url || seen[url]) continue;
        seen[url] = true;
        const imgTag = block.match(/<img\s[^>]*>/);
        let src = '';
        if (imgTag) {
            src = attr(imgTag[0], 'data-src') || attr(imgTag[0], 'data-lazy-src') || attr(imgTag[0], 'src');
        }
        const ch = block.match(/<div class="epxs">([\s\S]*?)<\/div>/);
        const sc = block.match(/<div class="numscore">([\s\S]*?)<\/div>/);
        const tt = block.match(/<div class="tt">([\s\S]*?)<\/div>/);
        out.push({
            id: url,
            title: decode(tt ? tt[1] : '') || decode(attr(aTag[0], 'title')),
            cover_url: cleanCover(src),
            latest_chapter: ch ? decode(ch[1]) : '',
            rating: sc ? decode(sc[1]) : '-',
            views: '-',
        });
    }
    return out;
}

// Kalau tidak ada kartu sama sekali, tampilkan petunjuk isi halaman supaya mudah dilacak
function emptyError(html, url) {
    if (/Just a moment|Checking your browser|cf-browser-verification|challenge-platform/i.test(html)) {
        return new Error('Situs memakai tantangan Cloudflare dan memblokir app (halaman "Just a moment..."). ' +
            'Lihat bagian OPSIONAL di atas file komikdewasa.js untuk memakai cf_clearance dari browser.');
    }
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    return new Error('Tidak ada kartu komik. URL: ' + url + ' | panjang ' + html.length +
        ' | title: ' + (t ? decode(t[1]).slice(0, 80) : '-') + ' | isi: ' + decode(body).slice(0, 120));
}

// Ambil kartu dari satu bagian halaman; kalau kosong, coba seluruh halaman
function cardsFrom(html, startMark, endMark) {
    let cards = parseCards(section(html, startMark, endMark));
    if (!cards.length) cards = parseCards(html);
    return cards;
}

// Buang gambar iklan / watermark situs yang bukan halaman komik
function isPage(u) {
    return !/IKLAN|WM-KOMIK-DEWASA|\/bkp-/i.test(u);
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
            const cards = cardsFrom(html, 'class="listupd"', 'class="pagination"');
            if (!cards.length && page === 1 && html.indexOf('class="bsx"') < 0 && html.indexOf('Nothing Found') < 0) throw emptyError(html, url);
            return { manga_list: cards };
        }

        // Genre (opsional): filters.genre = 'doujinshi'
        if (filters && filters.genre) {
            const g = String(filters.genre).trim();
            const url = BASE + '/genres/' + encodeURIComponent(g) + '/' + (page > 1 ? 'page/' + page + '/' : '');
            const html = await fetchHtml(url);
            return { manga_list: cardsFrom(html, 'class="listupd"', 'class="pagination"') };
        }

        // Populer: arsip /komik/?order=popular (kalau gagal, jatuh ke Latest Update)
        if (sort === 'popular') {
            try {
                const html = await fetchHtml(BASE + '/komik/?order=popular&page=' + page);
                const cards = cardsFrom(html, 'class="listupd"', 'class="pagination"');
                if (cards.length) return { manga_list: cards };
            } catch (e) { /* lanjut ke latest */ }
        }

        // Latest Update dari beranda (/page/N/)
        const homeUrl = page > 1 ? BASE + '/page/' + page + '/' : BASE + '/';
        const html = await fetchHtml(homeUrl);
        const cards = cardsFrom(html, 'Latest Update', 'class="pagination"');
        if (!cards.length && page === 1) throw emptyError(html, homeUrl);
        return { manga_list: cards };
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

        // Situs ini mengurutkan chapter dari yang terlama; KonMik menampilkan yang terbaru di atas
        if (chapters.length > 1) {
            const num = c => { const m = String(c.title).match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : null; };
            const a = num(chapters[0]);
            const b = num(chapters[chapters.length - 1]);
            if (a !== null && b !== null && a < b) chapters.reverse();
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
                        if (/^https?:\/\//.test(u) && isPage(u)) images.push(u);
                    }
                }
            }
        }
        if (images.length) return images;

        // 2) Cadangan: <img> di dalam #readerarea
        const area = section(html, 'id="readerarea"', 'class="chnav');
        const ire = /<img[^>]+src="(https?:\/\/[^"]+)"/g;
        let im;
        while ((im = ire.exec(area)) !== null) { if (isPage(im[1])) images.push(im[1]); }
        return images;
    },
};
