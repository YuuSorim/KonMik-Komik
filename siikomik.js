// ID: ext_siikomik
// NAME: Siikomik
// TYPE: comic
// VERSION: 1.0.1
// COLOR: #ff4757
// ICON: https://www.google.com/s2/favicons?domain=siikomik.com&sz=64
// REFERER: https://siikomik.com/

const BASE = 'https://siikomik.com';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': 'https://siikomik.com/',
    'Origin': 'https://siikomik.com',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
};

async function fetchHtml(url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
}

function extractNextData(html) {
    const scriptRegex = /<script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
    let match;
    let fullText = "";
    while ((match = scriptRegex.exec(html)) !== null) {
        let content = match[1];
        content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        fullText += content + "\n";
    }
    return fullText;
}

var KonmikExtension = {
    // 1. Ambil Daftar Komik (SUDAH DIPERBAIKI)
    async getList(page, query, filters) {
    async getList(page, query, filters) {
        // Jika ada query, ambil dari halaman pencarian.
        // Jika tidak, ambil dari halaman katalog utama.
        let url = query 
            ? `${BASE}/cari/?q=${encodeURIComponent(query)}` 
            : `${BASE}/komik/`;
            
        const html = await fetchHtml(url);
        const mangaList = [];
        
        const cardRegex = /<a[^>]+href="(\/komik\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        const seen = new Set();
        
        while ((m = cardRegex.exec(html)) !== null) {
            const path = m[1];
            const innerHtml = m[2];
            
            if (path.includes('/chapter-') || path.includes('/genre/') || seen.has(path)) continue;
            
            const imgMatch = innerHtml.match(/(?:src|data-src)="([^"]+)"/i);
            let titleMatch = innerHtml.match(/alt="([^"]+)"/i) || innerHtml.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i) || innerHtml.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)</i);
            
            if (imgMatch) {
                seen.add(path);
                let cover = imgMatch[1].replace(/&amp;/g, '&');
                let title = titleMatch ? titleMatch[1].trim() : path.split('/').filter(Boolean).pop().replace(/-/g, ' ');
                
                mangaList.push({
                    id: path,
                    title: title,
                    cover_url: cover,
                    latest_chapter: '',
                    rating: '-',
                    views: '-'
                });
            }
        }
        
        return { manga_list: mangaList };
    },
    // 2. Ambil Detail Komik
    async getDetail(slug) {
        let url = slug;
        if (!url.startsWith('http')) {
            url = slug.startsWith('/') ? BASE + slug : BASE + '/komik/' + slug + '/';
        }

        const html = await fetchHtml(url);
        const nextDataStr = extractNextData(html);

        let title = "";
        let cover = "";
        let description = "";
        let author = "";
        let rating = "";
        let views = "";
        let genres = [];
        let chapters = [];

        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (titleMatch) title = titleMatch[1].trim();

        const coverMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (coverMatch) cover = coverMatch[1].replace(/&amp;/g, '&');

        const descMatch = html.match(/<div class="prose-sk[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
            description = descMatch[1].replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
        }

        if (nextDataStr) {
            const ratingMatch = nextDataStr.match(/"initialAvg":([\d.]+)/);
            if (ratingMatch) rating = ratingMatch[1];

            const viewsMatch = nextDataStr.match(/"initialViews":(\d+)/);
            if (viewsMatch) {
                const v = parseInt(viewsMatch[1]);
                views = v > 1000 ? (v/1000).toFixed(1) + 'K' : v.toString();
            }
            
            const genreMatch = nextDataStr.match(/"genres":\[(.*?)\]/);
            if (genreMatch) {
                const gStr = genreMatch[1];
                const gMatches = gStr.match(/"([^"]+)"/g);
                if (gMatches) {
                    genres = gMatches.map(g => g.replace(/"/g, ''));
                }
            }

            const chIndex = nextDataStr.indexOf('"initialChapters":');
            if (chIndex !== -1) {
                const startIdx = nextDataStr.indexOf('[', chIndex);
                let bracketCount = 0;
                let endIdx = -1;
                for (let i = startIdx; i < nextDataStr.length; i++) {
                    if (nextDataStr[i] === '[') bracketCount++;
                    if (nextDataStr[i] === ']') bracketCount--;
                    if (bracketCount === 0) {
                        endIdx = i;
                        break;
                    }
                }
                
                if (endIdx !== -1) {
                    let chJsonStr = nextDataStr.substring(startIdx, endIdx + 1);
                    try {
                        const chArr = JSON.parse(chJsonStr);
                        chapters = chArr.sort((a, b) => a.number - b.number).map(ch => ({
                            id: `/komik/${slug.replace(/^\/komik\/|\/$/g, '')}/${ch.slug}/`,
                            title: ch.name,
                            endpoint: `/komik/${slug.replace(/^\/komik\/|\/$/g, '')}/${ch.slug}/`,
                            date: new Date(ch.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                        }));
                    } catch(e) {}
                }
            }
        }

        if (chapters.length === 0) {
            const noscriptMatch = html.match(/<noscript>([\s\S]*?)<\/noscript>/i);
            if (noscriptMatch) {
                const linkRegex = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
                let lm;
                while ((lm = linkRegex.exec(noscriptMatch[1])) !== null) {
                    chapters.push({
                        id: lm[1],
                        title: lm[2].trim(),
                        endpoint: lm[1],
                        date: ''
                    });
                }
                chapters.reverse();
            }
        }

        return {
            title: title || "Unknown Title",
            cover_url: cover || "",
            description: description || "Tidak ada deskripsi.",
            author: author,
            artist: author,
            rating: rating || "-",
            views: views || "-",
            genres: genres,
            chapters: chapters
        };
    },

    // 3. Ambil Gambar Chapter (SUDAH DIPERBAIKI)
    async getChapterImages(endpoint) {
        const url = endpoint.startsWith('http') ? endpoint : BASE + endpoint;
        const html = await fetchHtml(url);
        const nextDataStr = extractNextData(html);

        let images = [];

        if (nextDataStr) {
            const pagesIndex = nextDataStr.indexOf('"initialPages":');
            if (pagesIndex !== -1) {
                const startIdx = nextDataStr.indexOf('{', pagesIndex);
                const endIdx = nextDataStr.indexOf('"status":"FREE"', startIdx);
                
                // Kadang statusnya bukan "FREE" (misal "LOCKED"), jadi kita pakai pencarian mundur
                let finalEndIdx = endIdx !== -1 ? endIdx + 15 : nextDataStr.indexOf('}', startIdx);
                
                if (startIdx !== -1 && finalEndIdx !== -1) {
                    let jsonStr = nextDataStr.substring(startIdx, finalEndIdx);
                    if (!jsonStr.endsWith('}')) jsonStr += '}';
                    
                    try {
                        const pagesData = JSON.parse(jsonStr);
                        if (pagesData && pagesData.pages) {
                            // PERBAIKAN 1: Ubah &amp; menjadi & agar URL gambar tidak rusak
                            images = pagesData.pages.map(p => p.url.replace(/&amp;/g, '&'));
                        }
                    } catch (e) {}
                }
            }
        }

        if (images.length === 0) {
            const imgRegex = /<img[^>]+src="(https:\/\/siikomik\.com\/api\/media\/[^"]+)"[^>]*>/gi;
            let m;
            while ((m = imgRegex.exec(html)) !== null) {
                // PERBAIKAN 2: Bersihkan URL dari &amp;
                const cleanUrl = m[1].replace(/&amp;/g, '&');
                if (!images.includes(cleanUrl)) {
                    images.push(cleanUrl);
                }
            }
        }

        return images;
    }
};
