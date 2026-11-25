// ID: ext_webkomikdewasa
// NAME: WebKomikDewasa (ID)
// TYPE: comic
// VERSION: 1.0.2
// COLOR: #1977FC
// ICON: https://i0.wp.com/webkomikdewasa.top/wp-content/uploads/2025/04/cropped-Untitled-1-copy-1-270x270.png
// REFERER: https://webkomikdewasa.top/

const BASE = 'https://webkomikdewasa.top';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': BASE + '/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

// Gambar yang bukan halaman komik (banner, header/footer chapter, dll.)
const IMAGE_BLACKLIST = /webkomikdewasa-atas|webkomikdewasa-bawah|WM-KOMIK-DEWASA|readerarea\.svg|btn_close|banner-iklan|Betcoin|histats|yandex/i;

async function fetchHtml(url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' saat memuat ' + url);
    return await res.text();
}

function decodeEntities(s) {
    return s
        .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); })
        .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function cleanText(s) {
    if (!s) return '';
    return decodeEntities(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function firstMatch(regex, str, def) {
    const m = str.match(regex);
    return m && m[1] !== undefined ? m[1].trim() : (def === undefined ? '' : def);
}

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return BASE + u;
    return u;
}

function getAttr(tag, name) {
    const m = tag.match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
    return m ? m[1] : '';
}

// Ambil URL gambar dari tag <img ...>, mendukung lazy-load.
function imgFromTag(tag) {
    const names = ['data-lazy-src', 'data-src', 'data-original', 'src'];
    for (const n of names) {
        const v = getAttr(tag, n);
        if (v && !v.startsWith('data:')) return absUrl(decodeEntities(v));
    }
    return '';
}

function stripResize(u) {
    return u && u.indexOf('?') !== -1 ? u.split('?')[0] : u;
}

function seriesUrl(idOrSlug) {
    if (/^https?:\/\//i.test(idOrSlug)) return idOrSlug;
    return BASE + '/series/' + idOrSlug.replace(/^\/+|\/+$/g, '') + '/';
}

// Parser kartu komik: dipakai untuk katalog, pencarian, dan beranda.
function parseCards(html) {
    const list = [];
    const seen = {};
    const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchorRegex.exec(html)) !== null) {
        const attrs = m[1];
        const inner = m[2];
        const href = getAttr(attrs, 'href');
        const slugMatch = href.match(/\/series\/([^\/?#]+)\/?$/);
        if (!slugMatch) continue;
        const imgTag = inner.match(/<img\b[^>]*>/i);
        if (!imgTag) continue;

        const url = absUrl(href);
        if (seen[url]) continue;
        seen[url] = true;

        let title = getAttr(attrs, 'title');
        if (!title) title = cleanText(firstMatch(/class=["']tt["'][^>]*>([\s\S]*?)<\/div>/i, inner));
        if (!title) title = getAttr(imgTag[0], 'alt');
        if (!title) title = slugMatch[1].replace(/-/g, ' ');

        const latest = cleanText(firstMatch(/class=["']epxs["'][^>]*>([\s\S]*?)<\/div>/i, inner));
        const rating = firstMatch(/class=["']numscore["'][^>]*>\s*([\d.,]+)/i, inner, '-');

        list.push({
            id: url,
            title: cleanText(title),
            cover_url: stripResize(imgFromTag(imgTag[0])),
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
        const sort = filters && filters.sort === 'popular' ? 'popular' : 'update';

        let url;
        if (query && query.trim().length > 0) {
            const q = encodeURIComponent(query.trim());
            url = page > 1 ? BASE + '/page/' + page + '/?s=' + q : BASE + '/?s=' + q;
        } else {
            url = BASE + '/series/?page=' + page + '&order=' + sort;
        }

        const html = await fetchHtml(url);
        return { manga_list: parseCards(html) };
    },

    async getDetail(idOrSlug) {
        const url = seriesUrl(idOrSlug);
        const html = await fetchHtml(url);

        const title = cleanText(firstMatch(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i, html))
            || cleanText(firstMatch(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html, 'Tanpa Judul'));

        // Cover: og:image paling stabil, fallback ke <div class="thumb">
        let cover = firstMatch(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i, html)
            || firstMatch(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i, html);
        if (!cover) {
            const thumbBlock = firstMatch(/<div[^>]*class=["'][^"']*thumb[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, html);
            const thumbImg = thumbBlock.match(/<img\b[^>]*>/i);
            if (thumbImg) cover = imgFromTag(thumbImg[0]);
        }
        cover = stripResize(cover);

        // Sinopsis
        let descBlock = firstMatch(/<div[^>]*itemprop=["']description["'][^>]*>([\s\S]*?)<\/div>/i, html)
            || firstMatch(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, html);
        let description = cleanText(descBlock);
        description = description.replace(/[“"]?Peringatan,?[\s\S]*$/i, '').trim();
        if (!description) description = 'Tidak ada deskripsi.';

        // Info (Author / Artist / Status / Type) berbentuk: Author <i>Nama</i>
        const info = function (label) {
            return cleanText(firstMatch(new RegExp(label + '\\s*<(?:i|span|b)[^>]*>([\\s\\S]*?)<\\/(?:i|span|b)>', 'i'), html));
        };
        const author = info('Author') || 'Unknown';
        const artist = info('Artist') || author;

        // Genre: hanya dari blok genre milik series ini (bukan sidebar)
        const genres = [];
        const genreBlock = firstMatch(/<span[^>]*class=["'][^"']*mgen[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, html);
        const genreRegex = /<a[^>]+href=["'][^"']*\/genres\/[^"']+["'][^>]*>([^<]+)<\/a>/gi;
        let g;
        while ((g = genreRegex.exec(genreBlock)) !== null) {
            const name = cleanText(g[1]);
            if (name && genres.indexOf(name) === -1) genres.push(name);
        }
        if (genres.length === 0) genres.push('Mature');

        const rating = firstMatch(/itemprop=["']ratingValue["'][^>]*>\s*([\d.,]+)/i, html)
            || firstMatch(/class=["']num["'][^>]*>\s*([\d.,]+)/i, html, '-');

        // Daftar chapter (urutan situs: terbaru -> terlama)
        const chapters = [];
        const chSeen = {};
        const liRegex = /<li\b[^>]*data-num=["'][^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
        let li;
        while ((li = liRegex.exec(html)) !== null) {
            const block = li[1];
            const a = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
            if (!a) continue;
            const chUrl = absUrl(a[1]);
            if (chSeen[chUrl]) continue;
            chSeen[chUrl] = true;

            const chTitle = cleanText(firstMatch(/class=["']chapternum["'][^>]*>([\s\S]*?)<\/span>/i, a[2]))
                || cleanText(a[2]);
            const chDate = cleanText(firstMatch(/class=["']chapterdate["'][^>]*>([\s\S]*?)<\/span>/i, a[2]));
            chapters.push({ id: chUrl, title: chTitle, endpoint: chUrl, date: chDate });
        }

        // Fallback bila struktur <li data-num> tidak ditemukan
        if (chapters.length === 0) {
            const aRegex = /<a\b[^>]*href=["']([^"']*-chapter-[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            let a2;
            while ((a2 = aRegex.exec(html)) !== null) {
                const chUrl = absUrl(a2[1]);
                if (chSeen[chUrl]) continue;
                chSeen[chUrl] = true;
                chapters.push({ id: chUrl, title: cleanText(a2[2]) || 'Chapter', endpoint: chUrl, date: '' });
            }
        }

        return {
            title: title,
            cover_url: cover,
            description: description,
            author: author,
            artist: artist,
            rating: rating,
            views: '-',
            genres: genres,
            chapters: chapters
        };
    },

    async _fromHtml(endpoint) {
        const html = await fetchHtml(absUrl(endpoint));
        const images = [];
        const seen = {};
        const push = function (u) {
            if (!u || seen[u] || IMAGE_BLACKLIST.test(u)) return;
            seen[u] = true;
            images.push(u);
        };

        // 1) JSON ts_reader.run({... "images":["...","..."] ...}) -> paling bersih
        const jsonMatch = html.match(/"images"\s*:\s*(\[[^\]]*\])/);
        if (jsonMatch) {
            try {
                JSON.parse(jsonMatch[1]).forEach(function (u) { push(absUrl(u)); });
            } catch (e) { /* lanjut ke cara 2 */ }
        }

        // 2) Fallback: semua <img> di dalam #readerarea
        if (images.length === 0) {
            const start = html.search(/id=["']readerarea["']/i);
            if (start !== -1) {
                let end = html.indexOf('<div class="kln"', start + 1);
                if (end === -1) end = html.length;
                const area = html.substring(start, end);
                const imgRegex = /<img\b[^>]*>/gi;
                let im;
                while ((im = imgRegex.exec(area)) !== null) {
                    push(imgFromTag(im[0]));
                }
            }
        }

        if (images.length === 0) {
            // Pesan diagnostik supaya mudah dilacak dari sisi aplikasi
            const snippet = html.substring(0, 120).replace(/\s+/g, ' ');
            throw new Error('Gambar chapter tidak ditemukan (panjang HTML ' + html.length + '): ' + snippet);
        }
        return images;
    },

    // Jalur utama: REST API WordPress (ringan, hanya isi chapter)
    async getChapterImages(endpoint) {
        const url = absUrl(String(endpoint));
        const slug = url.split('#')[0].split('?')[0].replace(/\/+$/, '').split('/').pop();

        try {
            const apiUrl = BASE + '/wp-json/wp/v2/posts?slug=' + encodeURIComponent(slug) + '&_fields=id,content';
            const res = await fetch(apiUrl, { headers: HEADERS });
            if (res.ok) {
                const data = JSON.parse(await res.text());
                const rendered = data && data[0] && data[0].content && data[0].content.rendered;
                if (rendered) {
                    const images = [];
                    const seen = {};
                    const imgRegex = /<img\b[^>]*>/gi;
                    let im;
                    while ((im = imgRegex.exec(rendered)) !== null) {
                        const u = imgFromTag(im[0]);
                        if (!u || seen[u] || IMAGE_BLACKLIST.test(u)) continue;
                        seen[u] = true;
                        images.push(u);
                    }
                    if (images.length > 0) return images;
                }
            }
        } catch (e) { /* lanjut ke cara cadangan */ }

        // Cadangan: parsing halaman chapter penuh
        return await KonmikExtension._fromHtml(endpoint);
    }
};
