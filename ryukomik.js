// ID: ext_ryukomik
// NAME: Ryukomik
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #06b6d4
// ICON: https://www.google.com/s2/favicons?domain=ryukomik.com&sz=64
// REFERER: https://ryukomik.com/

const BASE = 'https://ryukomik.com';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': BASE + '/'
};

async function fetchHtml(url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
}

var KonmikExtension = {
    // 1. Ambil Daftar Komik (Katalog / Pencarian)
    async getList(page, query, filters) {
        let url = query 
            ? `${BASE}/search?q=${encodeURIComponent(query)}` 
            : `${BASE}/`; 

        const html = await fetchHtml(url);
        const mangaList = [];

        // Regex berdasarkan struktur kartu komik Ryukomik
        const cardRegex = /<a[^>]+href="(\/komik\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/gi;
        
        let m;
        const seen = new Set();

        while ((m = cardRegex.exec(html)) !== null) {
            const path = m[1];
            const cover = m[2];
            const title = m[3];

            if (seen.has(path)) continue;
            seen.add(path);

            mangaList.push({
                id: path,
                title: title.trim(),
                cover_url: cover,
                latest_chapter: '',
                rating: '-',
                views: '-'
            });
        }

        return { manga_list: mangaList };
    },

    // 2. Ambil Detail Komik & Daftar Chapter
    async getDetail(slug) {
        const url = slug.startsWith('http') ? slug : BASE + slug;
        const html = await fetchHtml(url);

        // Ambil Judul
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const title = titleMatch ? titleMatch[1].trim() : 'Unknown Title';

        // Ambil Cover
        const coverMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        const cover = coverMatch ? coverMatch[1] : '';

        // Ambil Sinopsis
        const descMatch = html.match(/<div[^>]*class="[^"]*(?:synopsis|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : 'Tidak ada sinopsis.';

        // Ambil Daftar Chapter (Berdasarkan kode yang kamu kirim)
        const chapters = [];
        const chRegex = /<a[^>]+href="(\/chapter\/[^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]*Chapter[^<]*)<\/span>[\s\S]*?(?:<span[^>]*>([^<]*)<\/span>)?/gi;
        
        let cm;
        while ((cm = chRegex.exec(html)) !== null) {
            const chUrl = cm[1];
            const chTitle = cm[2].trim();
            // Ambil tanggal jika ada, kalau tidak kosongkan
            const chDate = cm[3] ? cm[3].trim() : '';

            chapters.push({
                id: chUrl,
                title: chTitle,
                endpoint: chUrl,
                date: chDate
            });
        }

        // Urutkan chapter dari yang paling kecil (Chapter 1) ke besar
        chapters.sort((a, b) => {
            const numA = parseInt(a.title.match(/\d+/) || 0);
            const numB = parseInt(b.title.match(/\d+/) || 0);
            return numA - numB;
        });

        return {
            title: title,
            cover_url: cover,
            description: description,
            author: '',
            artist: '',
            rating: '-',
            views: '-',
            genres: [],
            chapters: chapters
        };
    },

    // 3. Ambil Gambar Chapter
    async getChapterImages(endpoint) {
        const url = endpoint.startsWith('http') ? endpoint : BASE + endpoint;
        const html = await fetchHtml(url);

        const images = [];
        // Regex untuk mengambil gambar berdasarkan kode yang kamu kirim
        // Mengambil semua tag <img> yang memiliki class bg-[var(--background)] dan src dari cdn.kiryuu.io
        const imgRegex = /<img[^>]+src="(https:\/\/cdn\.kiryuu\.io\/[^"]+)"[^>]*>/gi;
        
        let m;
        while ((m = imgRegex.exec(html)) !== null) {
            const imgUrl = m[1];
            if (!images.includes(imgUrl)) {
                images.push(imgUrl);
            }
        }

        return images;
    }
};
