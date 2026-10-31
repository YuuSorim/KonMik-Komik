
// ID: ext_siikomik_id
// NAME: Siikomik
// TYPE: comic
// VERSION: 1.0.4
// COLOR: #7B61A8
// ICON: https://siikomik.id/favicon.ico
// REFERER: https://siikomik.id/

const BASE = 'https://siikomik.id';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': BASE + '/'
};

async function fetchHtml(url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' saat membuka ' + url);
    return await res.text();
}

function clean(text) {
    return (text || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#8217;|&#039;|&rsquo;/g, "'")
        .replace(/&quot;|&#34;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, ' ')
        .trim();
}

function absoluteUrl(url) {
    if (!url) return '';
    url = url.trim();
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return BASE + url;
    return url;
}

function getMatch(regex, html, fallback = '') {
    const match = html.match(regex);
    return match ? clean(match[1]) : fallback;
}

function getAttr(tag, attr) {
    const regex = new RegExp(
        '\\b' + attr + '\\s*=\\s*["\\']([^"\\']+)["\\']',
        'i'
    );
    const match = tag.match(regex);
    return match ? match[1] : '';
}

function extractAll(regex, html) {
    const matches = [];
    let match;
    regex.lastIndex = 0;

    while ((match = regex.exec(html)) !== null) {
        matches.push(match);
        if (match[0] === '') regex.lastIndex++;
    }

    return matches;
}

function getImageFromTag(tag) {
    return getAttr(tag, 'data-src') ||
        getAttr(tag, 'data-lazy-src') ||
        getAttr(tag, 'data-original') ||
        getAttr(tag, 'src');
}

var KonmikExtension = {
    async getList(page, query, filters) {
        page = Math.max(1, Number(page) || 1);

        let url;
        if (query && query.trim()) {
            url = BASE + '/?s=' + encodeURIComponent(query.trim());
            if (page > 1) url += '&paged=' + page;
        } else {
            url = page === 1
                ? BASE + '/'
                : BASE + '/page/' + page + '/';
        }

        const html = await fetchHtml(url);
        const mangaList = [];
        const seen = new Set();

        // Ambil tautan komik dari halaman situs
        const anchorRegex = /<a\b[^>]*href=["']([^"']*\/komik\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        const anchors = extractAll(anchorRegex, html);

        for (const match of anchors) {
            const link = absoluteUrl(match[1]);
            const inside = match[2];

            // Hanya halaman utama komik, bukan chapter
            if (!/\/komik\/[^/?#]+\/?$/i.test(link)) continue;
            if (seen.has(link)) continue;

            const imgTag = (inside.match(/<img\b[^>]*>/i) || [])[0] || '';
            const cover = absoluteUrl(getImageFromTag(imgTag));

            let title = getAttr(imgTag, 'alt') ||
                getAttr(imgTag, 'title') ||
                getMatch(/<[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i, inside) ||
                clean(inside);

            title = clean(title);
            if (!title) continue;

            seen.add(link);
            mangaList.push({
                id: link,
                title: title,
                cover_url: cover,
                rating: '-',
                views: '-'
            });
        }

        return { manga_list: mangaList };
    },

    async getDetail(urlPath) {
        const url = absoluteUrl(urlPath);
        const html = await fetchHtml(url);

        const title =
            getMatch(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i, html) ||
            getMatch(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)/i, html, 'Siikomik');

        let cover =
            getMatch(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)/i, html) ||
            getMatch(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i, html) ||
            getMatch(/<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]+src=["']([^"']+)/i, html);

        cover = absoluteUrl(cover);

        const description =
            getMatch(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i, html) ||
            getMatch(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][\s\S]*?<p>([\s\S]*?)<\/p>/i, html) ||
            'Tidak ada deskripsi.';

        const genres = [];
        const genreRegex = /<a\b[^>]*href=["'][^"']*\/genre\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
        const genreMatches = extractAll(genreRegex, html);

        for (const match of genreMatches) {
            const genre = clean(match[1]);
            if (genre && !genres.includes(genre)) genres.push(genre);
        }

        // Ambil semua chapter yang tersedia pada halaman detail
        const chapterRegex = /<a\b([^>]*href=["']([^"']*\/chapter-[^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;
        const chapterMatches = extractAll(chapterRegex, html);
        const chapters = [];
        const seenChapters = new Set();

        for (const match of chapterMatches) {
            const attrs = match[1];
            const chapterUrl = absoluteUrl(match[2]);
            const inside = match[3];

            if (seenChapters.has(chapterUrl)) continue;
            seenChapters.add(chapterUrl);

            let chapterTitle = clean(inside);
            if (!chapterTitle) {
                chapterTitle = getAttr(attrs, 'title');
            }
            if (!chapterTitle) continue;

            const date = getMatch(
                /<[^>]*class=["'][^"']*date[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
                inside,
                '-'
            );

            chapters.push({
                id: chapterUrl,
                title: chapterTitle,
                date: date
            });
        }

        return {
            title: title,
            cover_url: cover,
            description: description,
            rating: '-',
            views: '-',
            genres: genres,
            author: '-',
            artist: '-',
            chapters: chapters
        };
    },

    async getChapterImages(chapterUrl) {
        const html = await fetchHtml(absoluteUrl(chapterUrl));
        const images = [];
        const seen = new Set();

        // Cari gambar halaman chapter
        const imgRegex = /<img\b[^>]*>/gi;
        const imgTags = extractAll(imgRegex, html);

        for (const match of imgTags) {
            const tag = match[0];
            const src = getImageFromTag(tag);
            if (!src) continue;

            const imageUrl = absoluteUrl(src);

            if (!imageUrl || imageUrl.startsWith('data:')) continue;
            if (!/\.(jpg|jpeg|png|webp|avif)(?:[?#]|$)/i.test(imageUrl)) continue;

            // Lewati logo, avatar, dan gambar kecil yang bukan halaman komik
            if (/favicon|logo|avatar|icon/i.test(imageUrl)) continue;
            if (seen.has(imageUrl)) continue;

            seen.add(imageUrl);
            images.push(imageUrl);
        }

        if (images.length === 0) {
            throw new Error('Gambar chapter tidak ditemukan. Struktur halaman mungkin berubah.');
        }

        return images;
    }
};
