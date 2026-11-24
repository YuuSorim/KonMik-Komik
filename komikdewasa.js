// ID: ext_komikdewasa
// NAME: Komikdewasa
// TYPE: comic
// VERSION: 1.0.2
// COLOR: #E53935
// ICON: https://www.google.com/s2/favicons?domain=komikdewasa.art&sz=64
// REFERER: https://komikdewasa.art/

const BASE = 'https://komikdewasa.art';

// OPSIONAL: isi jika situs menampilkan tantangan Cloudflare.
// Salin nilai cookie "cf_clearance" dan User-Agent dari browser yang sama.
// Cookie terikat ke IP dan User-Agent, jadi tiap pengguna perlu mengisi sendiri.
const COOKIE = 'cf_clearance=Clx_HMql0kvCpMytj6aIF3sOTnvSTf072RrXQfZos_hFsYHHMjRBKJpQcoPTkTgphS3RmlFcH8dbniwqVjVDl5BqIA1uy3yt3wRLfu0zludrgPGch5HVopD3AxmHziiUoX1ZKIjLUSLBUY6EsZhuhHzbxLGT3G23F5Xc9sOcH5P7IXkjq5aBarLRnSmHPLtdoE-GEBsqz8oa_CJ4M6SFhKZ_zrIJIjDaIfSe3lTqFaD-0BaLRPJ46BGrvJoDhgGnU3Enzz3l3PZmM_c9amS2MGknnc1oxrydwQ7uXekvmiZlZfdJqzXfk3-g9HIRJVvlyZGwuFxu0g4UnCwXsL4MIdTf14WkVIcJWaW8zNoh9HmC6lamTOrbHGbzQtU1KGfuijmptOKYgIuyzzXORj8kOlQ';       // contoh: 'cf_clearance=abc123...'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

const HEADERS = {
    'User-Agent': USER_AGENT,
    'Referer': BASE + '/',
};
if (COOKIE) HEADERS['Cookie'] = COOKIE;

async function fetchHtml(url) {
    const res = await fetch(url, { headers: HEADERS });
    const body = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + ' pada ' + url + ' | ' + body.substring(0, 120).replace(/\s+/g, ' '));
    if (/Just a moment|cf-chl|challenge-platform|Attention Required/i.test(body.substring(0, 3000))) {
        throw new Error('Diblokir Cloudflare pada ' + url + (COOKIE ? ' (cookie kedaluwarsa atau User-Agent tidak cocok)' : ' (isi COOKIE dan USER_AGENT di bagian atas file ekstensi)'));
    }
    return body;
}

function clean(str) {
    if (!str) return '';
    return str
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#8211;/g, '–')
        .replace(/&#8216;|&#8217;|&#039;|&#39;/g, "'")
        .replace(/&#8220;|&#8221;|&quot;/g, '"')
        .replace(/&#038;|&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function abs(u) {
    if (!u) return '';
    u = u.trim().replace(/&#038;|&amp;/g, '&');
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return BASE + u;
    return u;
}

function attr(tag, name) {
    const m = tag.match(new RegExp('(?:^|[\\s"\'])' + name + '=["\']([^"\']+)["\']', 'i'));
    return m ? m[1] : '';
}

function imgSrc(tag) {
    for (const a of ['data-lazy-src', 'data-src', 'src']) {
        const v = attr(tag, a);
        if (v && !v.startsWith('data:')) return abs(v);
    }
    return '';
}

function firstMatch(regex, str, def) {
    const m = str.match(regex);
    return m ? clean(m[1]) : (def || '');
}

function tableRow(html, label) {
    const re = new RegExp('<tr><td>\\s*' + label + '\\s*</td><td>([\\s\\S]*?)</td></tr>', 'i');
    return firstMatch(re, html);
}

// Kartu komik: dipakai di halaman populer, pencarian, dan beranda
function parseCards(html) {
    const list = [];
    const seen = {};
    const re = /<a\s+href=["'](https?:\/\/[^"']*\/komik\/[^"'\/]+\/?)["']\s+title=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const link = m[1];
        const inner = m[3];
        if (seen[link]) continue;
        const imgTag = (inner.match(/<img[^>]*>/i) || [''])[0];
        if (!imgTag) continue;
        const cover = imgSrc(imgTag);
        const title = clean(m[2]) || clean(attr(imgTag, 'alt'));
        if (!cover || !title) continue;

        // Bab terbaru: ".epxs" (di dalam <a>) atau ".fivchap" (setelah </a> di beranda)
        let tail = html.substr(re.lastIndex, 900);
        const nextCard = tail.indexOf('<div class="bs');
        if (nextCard > 0) tail = tail.substring(0, nextCard);
        const latest = firstMatch(/class=["']epxs["'][^>]*>([\s\S]*?)<\/div>/i, inner) ||
                       firstMatch(/class=["']fivchap["'][^>]*>([\s\S]*?)<\/span>/i, tail);
        const rating = firstMatch(/class=["']numscore["'][^>]*>([^<]+)</i, inner, '-');

        seen[link] = true;
        list.push({
            id: link,
            title: title,
            cover_url: cover,
            latest_chapter: latest,
            rating: rating,
            views: '-'
        });
    }
    return list;
}

var KonmikExtension = {
    async getList(page, query, filters) {
        page = page || 1;
        let url;
        let latestHome = false;

        if (query && query.trim().length > 0) {
            const q = encodeURIComponent(query.trim());
            url = page > 1 ? `${BASE}/page/${page}/?s=${q}` : `${BASE}/?s=${q}`;
        } else if (filters && filters.sort === 'popular') {
            url = `${BASE}/komik/?order=popular&page=${page}`;
        } else {
            // Terbaru: halaman beranda, bagian "Latest Update"
            url = page > 1 ? `${BASE}/page/${page}/` : `${BASE}/`;
            latestHome = true;
        }

        let html = await fetchHtml(url);

        if (latestHome) {
            const start = html.indexOf('<h2>Latest Update</h2>');
            if (start >= 0) {
                let end = html.length;
                for (const marker of ['<h2>Recommendation', 'class="pagination"', '<h3>Popular']) {
                    const i = html.indexOf(marker, start);
                    if (i > 0 && i < end) end = i;
                }
                html = html.substring(start, end);
            }
        }

        const cards = parseCards(html);
        if (cards.length === 0 && page === 1) {
            throw new Error('Tidak ada kartu terbaca. Panjang HTML=' + html.length + ' | awal: ' + html.substring(0, 120).replace(/\s+/g, ' '));
        }
        return { manga_list: cards };
    },

    async getDetail(url) {
        url = abs(url);
        const html = await fetchHtml(url);

        const title = firstMatch(/<h1[^>]*class=["']entry-title["'][^>]*>([\s\S]*?)<\/h1>/i, html, 'Unknown Title');

        let cover = '';
        const thumb = html.match(/class=["']thumb["'][^>]*>\s*(<img[^>]*>)/i);
        if (thumb) cover = imgSrc(thumb[1]);
        if (!cover) cover = abs(firstMatch(/class=["']bigbanner["'][^>]*url\(['"]?([^'")]+)/i, html));

        let description = '';
        const descMatch = html.match(/class=["']entry-content entry-content-single["'][^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
            description = clean(descMatch[1].replace(/<img[^>]*>/gi, '').replace(/<span class=["']colored["'][\s\S]*?<\/span>/gi, ''));
        }
        if (!description) description = 'Tidak ada deskripsi.';

        const alt = tableRow(html, 'Alternative');
        const status = tableRow(html, 'Status');
        const type = tableRow(html, 'Type');
        if (alt) description += '\n\nJudul alternatif: ' + alt;
        if (status || type) description += '\n' + [type, status].filter(Boolean).join(' • ');

        const rating = firstMatch(/class=["']num["'][^>]*itemprop=["']ratingValue["'][^>]*>([^<]+)</i, html, '-');
        let views = tableRow(html, 'Views');
        if (!views || views === '?') views = '-';

        const genres = [];
        const genreBlock = firstMatchRaw(/class=["']seriestugenre["'][^>]*>([\s\S]*?)<\/div>/i, html);
        const gRe = /<a[^>]+rel=["']tag["'][^>]*>([^<]+)<\/a>/gi;
        let g;
        while ((g = gRe.exec(genreBlock)) !== null) {
            const name = clean(g[1]);
            if (name && !genres.includes(name)) genres.push(name);
        }
        if (type && !genres.includes(type)) genres.push(type);

        // Daftar bab (di HTML urut dari bab 1 ke terbaru; dibalik agar terbaru di atas)
        const chapters = [];
        const listStart = html.indexOf('id="chapterlist"');
        if (listStart >= 0) {
            const listEnd = html.indexOf('</ul>', listStart);
            const listHtml = html.substring(listStart, listEnd > 0 ? listEnd : html.length);
            const liRe = /<li[^>]*data-num=["'][^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
            let li;
            while ((li = liRe.exec(listHtml)) !== null) {
                const block = li[1];
                const href = block.match(/<a[^>]+href=["']([^"']+)["']/i);
                if (!href) continue;
                const chUrl = abs(href[1]);
                chapters.push({
                    id: chUrl,
                    title: firstMatch(/class=["']chapternum["'][^>]*>([\s\S]*?)<\/span>/i, block, 'Chapter'),
                    endpoint: chUrl,
                    date: firstMatch(/class=["']chapterdate["'][^>]*>([\s\S]*?)<\/span>/i, block)
                });
            }
        }
        chapters.reverse();

        return {
            title: title,
            cover_url: cover,
            description: description,
            author: '-',
            artist: '-',
            rating: rating,
            views: views,
            genres: genres.length ? genres : ['Komik'],
            chapters: chapters
        };
    },

    async getChapterImages(endpoint) {
        const html = await fetchHtml(abs(endpoint));
        let images = [];

        // Sumber utama: array "images" dari ts_reader.run({...})
        const tsStart = html.indexOf('ts_reader.run(');
        if (tsStart >= 0) {
            const arr = html.substring(tsStart).match(/"images"\s*:\s*(\[[^\]]*\])/);
            if (arr) {
                try {
                    images = JSON.parse(arr[1]).map(abs);
                } catch (e) {}
            }
        }

        // Cadangan: tag <img> di dalam #readerarea
        if (images.length === 0) {
            const start = html.indexOf('id="readerarea"');
            if (start >= 0) {
                let region = html.substring(start);
                const end = region.indexOf('</div>');
                if (end > 0) region = region.substring(0, end);
                const imgRe = /<img[^>]*>/gi;
                let m;
                while ((m = imgRe.exec(region)) !== null) {
                    const src = imgSrc(m[0]);
                    if (src && !images.includes(src)) images.push(src);
                }
            }
        }
        return images;
    }
};

// Versi tanpa clean(): mengembalikan HTML mentah dari grup pertama
function firstMatchRaw(regex, str) {
    const m = str.match(regex);
    return m ? m[1] : '';
}
